import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { ChatGPTClient } from '../../api/client.js';
import { BackupService, type BackupResult } from '../../services/backup-service.js';
import { StorageService, type CheckpointEntry } from '../../services/storage-service.js';
import { scanAllConversations, downloadFiles, buildFileMap } from '../../services/file-service.js';
import { walkConversationTree } from '../../services/tree-walker.js';
import { getRenderer, getAvailableFormats } from '../../services/renderers.js';
import { logger } from '../../utils/logger.js';
import { createProgressBar } from '../progress.js';

export interface BackupCommandOptions {
  token?: string;
  cookies?: string;
  output: string;
  formats: string[];
  concurrency: number;
  delay: number;
  timeoutApi: number;
  timeoutDownload: number;
  incremental: boolean;
  downloadFiles: boolean;
  project?: string;
  includeSystem: boolean;
  includeTools: boolean;
  includeBranches: boolean;
  dryRun: boolean;
  force: boolean;
  rotateUserAgent: boolean;
  logFile?: string;
  verbose: boolean;
}

function runBackupWithProgress(
  service: BackupService,
  spinner: ReturnType<typeof ora>,
  options: {
    concurrency: number;
    delay: number;
    incremental: boolean;
    verbose: boolean;
    projectGizmoId?: string;
  }
): Promise<BackupResult> {
  let listProgressBar: ReturnType<typeof createProgressBar> | null = null;
  let downloadProgressBar: ReturnType<typeof createProgressBar> | null = null;
  let listingDone = false;

  return service
    .backup({
      ...options,
      onListProgress: (fetched, totalList) => {
        if (!listingDone) {
          if (!listProgressBar) {
            spinner.stop();
            listProgressBar = createProgressBar(totalList, 'Listing    ');
          }
          listProgressBar.setTotal(totalList);
          listProgressBar.update(fetched);

          if (fetched >= totalList) {
            listProgressBar.stop();
            listingDone = true;
            console.log();
          }
        }
      },
      onDownloadProgress: (completed, totalDownload) => {
        if (listingDone) {
          if (!downloadProgressBar) {
            downloadProgressBar = createProgressBar(
              totalDownload,
              'Downloading'
            );
          }
          downloadProgressBar.update(completed);
        }
      },
      onError: (id, error) => {
        if (options.verbose) {
          console.error(
            chalk.red(`\nFailed to download ${id}: ${error.message}`)
          );
        }
      },
    })
    .then((result) => {
      downloadProgressBar?.stop();
      return result;
    });
}

export async function backupCommand(
  options: BackupCommandOptions
): Promise<void> {
  const {
    token,
    cookies,
    output,
    formats,
    concurrency,
    delay,
    timeoutApi,
    timeoutDownload,
    incremental,
    downloadFiles: shouldDownloadFiles,
    project,
    includeSystem,
    includeTools,
    includeBranches,
    dryRun,
    force,
    rotateUserAgent,
    logFile,
    verbose,
  } = options;

  // Configure logger
  logger.configure({ logFile, verbose });

  const client = new ChatGPTClient(token, {
    verbose,
    timeout: { api: timeoutApi, download: timeoutDownload },
    rotateUserAgent,
    cookies,
  });
  const spinner = ora('Authenticating...').start();

  try {
    await client.initialize();
    spinner.succeed('Authenticated');

    console.log(chalk.dim(`\nBackup settings:`));
    console.log(chalk.dim(`  Output: ${output}`));
    console.log(chalk.dim(`  Formats: ${formats.join(', ')}`));
    console.log(chalk.dim(`  Concurrency: ${concurrency}`));
    console.log(chalk.dim(`  Delay: ${delay}ms`));
    console.log(chalk.dim(`  Timeout (API): ${timeoutApi}ms`));
    console.log(chalk.dim(`  Timeout (download): ${timeoutDownload}ms`));
    console.log(chalk.dim(`  Incremental: ${incremental}`));
    console.log(chalk.dim(`  Download files: ${shouldDownloadFiles}`));
    console.log(chalk.dim(`  Include system: ${includeSystem}`));
    console.log(chalk.dim(`  Include tools: ${includeTools}`));
    console.log(chalk.dim(`  All branches: ${includeBranches}`));
    console.log(chalk.dim(`  Dry run: ${dryRun}`));
    if (project) {
      console.log(chalk.dim(`  Project: ${project}`));
    }
    console.log();

    // Check output directory
    if (!dryRun && !force) {
      try {
        await fs.access(output);
        console.error(chalk.red(`Output directory already exists: ${output}`));
        console.error('Use --force to overwrite or choose a different --output path.');
        process.exit(1);
      } catch {
        // Directory doesn't exist, good
      }
    }

    if (dryRun) {
      console.log(chalk.yellow('DRY RUN - no files will be written\n'));
    }

    if (project) {
      // Single project backup
      const baseService = new BackupService(client, new StorageService(output));
      spinner.start('Resolving project...');
      const { gizmoId, name } = await baseService.resolveProjectId(project);
      spinner.succeed(`Project: ${name}`);

      const storage = new StorageService(output, name);
      const service = new BackupService(client, storage);

      if (dryRun) {
        const conversations = await service.listProjectConversations(gizmoId, { delay });
        console.log(chalk.cyan(`Would backup ${conversations.length} conversations from "${name}"`));
        return;
      }

      spinner.start(`Backing up project "${name}"...`);
      const result = await runBackupWithProgress(service, spinner, {
        concurrency,
        delay,
        incremental,
        verbose,
        projectGizmoId: gizmoId,
      });

      if (shouldDownloadFiles) {
        await runFileDownloads(client, output, { concurrency, delay, verbose });
      }

      const filesDir = shouldDownloadFiles
        ? path.join(output, 'files')
        : undefined;
      const { converted, errors } = await convertDirectory(output, filesDir, {
        formats,
        includeSystemMessages: includeSystem,
        includeToolMessages: includeTools,
        includeAllBranches: includeBranches,
      });

      printResult(result, output);
      console.log(`Converted ${converted} conversations to ${formats.join(', ')}.`);
      if (errors > 0) {
        console.log(`Conversion errors: ${chalk.red(errors)}`);
      }
    } else {
      // Full backup: main conversations + all projects
      let totalDownloaded = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      let totalConversations = 0;

      if (dryRun) {
        // Dry run: count only
        const mainService = new BackupService(client, new StorageService(output));
        const mainCount = await mainService.getConversationCount();
        const projects = await mainService.listProjects();
        let projectCount = 0;
        for (const proj of projects) {
          const convs = await mainService.listProjectConversations(proj.gizmo.id, { delay });
          projectCount += convs.length;
        }
        console.log(chalk.cyan(`Would backup ${mainCount} main conversations + ${projectCount} from ${projects.length} projects`));
        return;
      }

      // 1. Main conversations
      console.log(chalk.bold('Main conversations\n'));
      const mainStorage = new StorageService(output);
      const mainService = new BackupService(client, mainStorage);

      spinner.start('Fetching conversation list...');
      const mainResult = await runBackupWithProgress(mainService, spinner, {
        concurrency,
        delay,
        incremental,
        verbose,
      });

      totalDownloaded += mainResult.downloaded;
      totalSkipped += mainResult.skipped;
      totalFailed += mainResult.failed;
      totalConversations += mainResult.totalConversations;

      console.log();
      console.log(
        `  Downloaded: ${chalk.green(mainResult.downloaded)}, Skipped: ${chalk.yellow(mainResult.skipped)}, Failed: ${chalk.red(mainResult.failed)}`
      );
      console.log();

      // 2. Projects
      spinner.start('Fetching projects...');
      const projects = await mainService.listProjects();
      spinner.succeed(`Found ${projects.length} projects`);

      for (const proj of projects) {
        const name = proj.gizmo.display.name;
        const gizmoId = proj.gizmo.id;

        console.log();
        console.log(chalk.bold(`Project: ${name}\n`));

        const projStorage = new StorageService(output, name);
        const projService = new BackupService(client, projStorage);

        spinner.start(`Backing up "${name}"...`);
        const projResult = await runBackupWithProgress(projService, spinner, {
          concurrency,
          delay,
          incremental,
          verbose,
          projectGizmoId: gizmoId,
        });

        totalDownloaded += projResult.downloaded;
        totalSkipped += projResult.skipped;
        totalFailed += projResult.failed;
        totalConversations += projResult.totalConversations;

        console.log();
        console.log(
          `  Downloaded: ${chalk.green(projResult.downloaded)}, Skipped: ${chalk.yellow(projResult.skipped)}, Failed: ${chalk.red(projResult.failed)}`
        );
      }

      if (shouldDownloadFiles) {
        await runFileDownloads(client, output, { concurrency, delay, verbose });
      }

      const filesDir = shouldDownloadFiles
        ? path.join(output, 'files')
        : undefined;
      const { converted, errors } = await convertDirectory(output, filesDir, {
        formats,
        includeSystemMessages: includeSystem,
        includeToolMessages: includeTools,
        includeAllBranches: includeBranches,
      });

      console.log();
      console.log(chalk.green('\nBackup completed!'));
      console.log(`  Total conversations: ${totalConversations}`);
      console.log(`  Downloaded: ${chalk.green(totalDownloaded)}`);
      if (totalSkipped > 0) {
        console.log(`  Skipped (unchanged): ${chalk.yellow(totalSkipped)}`);
      }
      if (totalFailed > 0) {
        console.log(`  Failed: ${chalk.red(totalFailed)}`);
      }
      console.log(`  Converted ${converted} conversations to ${formats.join(', ')}`);
      if (errors > 0) {
        console.log(`  Conversion errors: ${chalk.red(errors)}`);
      }
      console.log(`\nOutput directory: ${chalk.cyan(output)}`);
    }
  } catch (error) {
    spinner.fail('Backup failed');

    if (error instanceof Error) {
      if (error.name === 'AuthenticationError') {
        console.error(chalk.red(`\nAuthentication failed: ${error.message}`));
        console.error(chalk.yellow('\nTo authenticate, either:'));
        console.error('  1. Bearer token: open chatgpt.com → DevTools → Network → /backend-api/* → Authorization header');
        console.error('  2. Cookies: open chatgpt.com → DevTools → Application → Cookies → copy all as "key=value; key2=value2"');
        console.error('     Then pass with --cookies flag or CHATGPT_COOKIES env variable.');
      } else {
        console.error(chalk.red(`\nError: ${error.message}`));
      }
    }

    process.exit(1);
  }
}

function printResult(result: BackupResult, output: string): void {
  console.log();
  console.log(chalk.green('\nBackup completed!'));
  console.log(`  Total conversations: ${result.totalConversations}`);
  console.log(`  Downloaded: ${chalk.green(result.downloaded)}`);
  if (result.skipped > 0) {
    console.log(`  Skipped (unchanged): ${chalk.yellow(result.skipped)}`);
  }
  if (result.failed > 0) {
    console.log(`  Failed: ${chalk.red(result.failed)}`);
    console.log(chalk.dim(`  See ${output}/backup.log for details`));
  }
  console.log(`\nOutput directory: ${chalk.cyan(output)}`);
}

async function loadFailedFiles(output: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(path.join(output, 'metadata.json'), 'utf-8');
    const metadata = JSON.parse(raw);
    if (Array.isArray(metadata.failedFiles)) {
      return new Set(metadata.failedFiles as string[]);
    }
  } catch {
    // No metadata yet
  }
  return new Set();
}

async function saveFailedFiles(
  output: string,
  failedFileIds: string[]
): Promise<void> {
  const metadataPath = path.join(output, 'metadata.json');
  let metadata: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    metadata = JSON.parse(raw);
  } catch {
    // No metadata yet
  }
  metadata.failedFiles = failedFileIds;
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

async function runFileDownloads(
  client: ChatGPTClient,
  output: string,
  options: { concurrency: number; delay: number; verbose: boolean }
): Promise<void> {
  console.log();
  const spinner = ora('Scanning conversations for file references...').start();
  const refs = await scanAllConversations(output);
  const skipFileIds = await loadFailedFiles(output);
  const skippedKnown = skipFileIds.size > 0
    ? refs.filter((r) => skipFileIds.has(r.fileId)).length
    : 0;
  const activeCount = refs.length - skippedKnown;
  spinner.succeed(
    `Found ${refs.length} file references` +
      (skippedKnown > 0
        ? ` (${skippedKnown} previously failed, skipped)`
        : '') +
      '\n'
  );

  if (activeCount === 0) return;

  const state: { bar: ReturnType<typeof createProgressBar> | null } = { bar: null };
  const errors: Array<{ fileId: string; message: string }> = [];

  const result = await downloadFiles(client, refs, output, {
    concurrency: options.concurrency,
    delay: options.delay,
    verbose: options.verbose,
    skipFileIds,
    onProgress: (completed, total) => {
      if (!state.bar) {
        state.bar = createProgressBar(total, 'Files      ');
      }
      state.bar.update(completed);
    },
    onError: (fileId, error) => {
      errors.push({ fileId, message: error.message });
    },
  });

  state.bar?.stop();
  console.log();
  console.log(
    `  Downloaded: ${chalk.green(result.downloaded)}, Skipped: ${chalk.yellow(result.skipped)}, Failed: ${chalk.red(result.failed)}`
  );

  // Merge new failures with previously known ones
  const allFailed = [...skipFileIds, ...result.failedFileIds];
  await saveFailedFiles(output, allFailed);

  if (errors.length > 0) {
    // Group errors by message
    const grouped = new Map<string, string[]>();
    for (const e of errors) {
      const list = grouped.get(e.message) ?? [];
      list.push(e.fileId);
      grouped.set(e.message, list);
    }
    for (const [message, fileIds] of grouped) {
      console.log(chalk.red(`    ${fileIds.length} files: ${message}`));
      if (options.verbose) {
        for (const id of fileIds) {
          console.log(chalk.dim(`      ${id}`));
        }
      }
    }
  }
}

async function convertDirectory(
  inputDir: string,
  filesDir: string | undefined,
  options: {
    formats: string[];
    includeSystemMessages: boolean;
    includeToolMessages: boolean;
    includeAllBranches: boolean;
  }
): Promise<{ converted: number; errors: number }> {
  let totalConverted = 0;
  let totalErrors = 0;

  for (const format of options.formats) {
    const renderer = getRenderer(format);
    const result = await convertDirectoryToFormat(inputDir, filesDir, renderer, options);
    totalConverted += result.converted;
    totalErrors += result.errors;
  }

  return { converted: totalConverted, errors: totalErrors };
}

async function convertDirectoryToFormat(
  inputDir: string,
  filesDir: string | undefined,
  renderer: ReturnType<typeof getRenderer>,
  options: {
    includeSystemMessages: boolean;
    includeToolMessages: boolean;
    includeAllBranches: boolean;
  }
): Promise<{ converted: number; errors: number }> {
  const jsonFiles = await collectAllJsonFiles(inputDir);
  const globalFileMap = filesDir ? await buildFileMap(filesDir) : null;

  let converted = 0;
  let errors = 0;

  for (const jsonPath of jsonFiles) {
    try {
      const raw = await fs.readFile(jsonPath, 'utf-8');
      const detail = JSON.parse(raw);

      // Compute relative paths from this file's directory to each file
      let fileMap: Map<string, string> | undefined;
      if (globalFileMap && globalFileMap.size > 0) {
        fileMap = new Map();
        const mdDir = path.dirname(jsonPath);
        for (const [fileId, filePath] of globalFileMap) {
          const absFilePath = path.join(inputDir, filePath);
          const relativePath = path.relative(mdDir, absFilePath);
          fileMap.set(fileId, relativePath);
        }
      }

      const tree = walkConversationTree(detail, options.includeAllBranches);

      // Render each branch as a separate file if multiple branches
      if (tree.branches.length <= 1) {
        // Single branch — normal file
        const renderResult = renderer.render(tree, {
          includeSystemMessages: options.includeSystemMessages,
          includeToolMessages: options.includeToolMessages,
        });
        const ext = renderResult.extension;
        const outPath = jsonPath.replace(/\.json$/, `.${ext}`);
        await fs.writeFile(outPath, renderResult.content, 'utf-8');
      } else {
        // Multiple branches — one file per branch
        const baseName = jsonPath.replace(/\.json$/, '');
        for (const branch of tree.branches) {
          const branchTree = { ...tree, branches: [branch] };
          const renderResult = renderer.render(branchTree, {
            includeSystemMessages: options.includeSystemMessages,
            includeToolMessages: options.includeToolMessages,
          });
          const ext = renderResult.extension;
          const outPath = `${baseName}__${branch.branchId}.${ext}`;
          await fs.writeFile(outPath, renderResult.content, 'utf-8');
        }
      }

      converted++;
    } catch (error) {
      errors++;
      logger.error(`Failed to convert ${jsonPath}`, error);
    }
  }

  return { converted, errors };
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json') {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }
  return files;
}

async function collectAllJsonFiles(inputDir: string): Promise<string[]> {
  const files: string[] = [];

  // Main conversations
  const mainDir = path.join(inputDir, 'conversations');
  files.push(...await findJsonFiles(mainDir));

  // Project conversations
  const projectsDir = path.join(inputDir, 'projects');
  try {
    const projectEntries = await fs.readdir(projectsDir, { withFileTypes: true });
    for (const entry of projectEntries) {
      if (entry.isDirectory()) {
        const projectConvDir = path.join(projectsDir, entry.name, 'conversations');
        files.push(...await findJsonFiles(projectConvDir));
      }
    }
  } catch {
    // No projects directory
  }

  return files;
}
