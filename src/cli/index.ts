import { Command } from 'commander';
import { backupCommand } from './commands/backup.js';
import { listCommand } from './commands/list.js';
import { projectsCommand } from './commands/projects.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('chatgpt-exporter')
    .description('Export your ChatGPT conversations')
    .version('2.0.0')
    .action(() => {
      program.help();
    });

  program
    .command('backup')
    .description('Download all conversations')
    .option('-t, --token <token>', 'Access token (or CHATGPT_TOKEN env)')
    .option('-o, --output <dir>', 'Output directory', './chatgpt-export')
    .option('-f, --format <fmt...>', 'Output format(s): md, txt, json, jsonl, html', ['md'])
    .option('--concurrency <n>', 'Parallel downloads', (v) => parseInt(v, 10), 3)
    .option('--delay <ms>', 'Delay between requests in ms', (v) => parseInt(v, 10), 500)
    .option('--timeout-api <ms>', 'Timeout for API calls', (v) => parseInt(v, 10), 30000)
    .option('--timeout-download <ms>', 'Timeout for file downloads', (v) => parseInt(v, 10), 120000)
    .option('--incremental', 'Only download new/updated conversations', false)
    .option('--download-files', 'Download file attachments and images', false)
    .option('--project <name-or-id>', 'Only backup conversations from a specific project')
    .option('--include-system', 'Include system messages in export', false)
    .option('--include-tools', 'Include tool results in export', false)
    .option('--no-branches', 'Only export main branch', false)
    .option('--dry-run', 'Preview without writing', false)
    .option('--force', 'Overwrite existing output directory', false)
    .option('--rotate-ua', 'Rotate User-Agent per request', false)
    .option('--log-file <path>', 'Structured log file path')
    .option('-v, --verbose', 'Verbose logging', false)
    .action(async (options) => {
      const token = options.token ?? process.env.CHATGPT_TOKEN;
      if (!token) {
        console.error('Error: Access token required. Use --token or set CHATGPT_TOKEN env variable.');
        process.exit(1);
      }
      await backupCommand({
        token,
        output: options.output,
        formats: options.format,
        concurrency: options.concurrency,
        delay: options.delay,
        timeoutApi: options.timeoutApi,
        timeoutDownload: options.timeoutDownload,
        incremental: options.incremental,
        downloadFiles: options.downloadFiles,
        project: options.project,
        includeSystem: options.includeSystem,
        includeTools: options.includeTools,
        includeBranches: options.branches,
        dryRun: options.dryRun,
        force: options.force,
        rotateUserAgent: options.rotateUa,
        logFile: options.logFile,
        verbose: options.verbose,
      });
    });

  program
    .command('list')
    .description('List conversations without downloading')
    .option('-t, --token <token>', 'Access token (or CHATGPT_TOKEN env)')
    .option('--delay <ms>', 'Delay between requests in ms', (v) => parseInt(v, 10), 500)
    .option('--project <name-or-id>', 'List conversations from a specific project')
    .option('-v, --verbose', 'Verbose logging', false)
    .option('--json', 'Output as JSON', false)
    .action(async (options) => {
      const token = options.token ?? process.env.CHATGPT_TOKEN;
      if (!token) {
        console.error('Error: Access token required. Use --token or set CHATGPT_TOKEN env variable.');
        process.exit(1);
      }
      await listCommand({
        token,
        delay: options.delay,
        verbose: options.verbose,
        json: options.json,
        project: options.project,
      });
    });

  program
    .command('projects')
    .description('List all projects')
    .option('-t, --token <token>', 'Access token (or CHATGPT_TOKEN env)')
    .option('-v, --verbose', 'Verbose logging', false)
    .option('--json', 'Output as JSON', false)
    .action(async (options) => {
      const token = options.token ?? process.env.CHATGPT_TOKEN;
      if (!token) {
        console.error('Error: Access token required. Use --token or set CHATGPT_TOKEN env variable.');
        process.exit(1);
      }
      await projectsCommand({
        token,
        verbose: options.verbose,
        json: options.json,
      });
    });

  return program;
}
