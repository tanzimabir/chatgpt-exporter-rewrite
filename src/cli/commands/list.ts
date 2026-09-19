import chalk from 'chalk';
import ora from 'ora';
import { ChatGPTClient } from '../../api/client.js';
import { BackupService } from '../../services/backup-service.js';
import { StorageService } from '../../services/storage-service.js';

export interface ListOptions {
  token?: string;
  cookies?: string;
  delay: number;
  verbose: boolean;
  json: boolean;
  project?: string;
}

export async function listCommand(options: ListOptions): Promise<void> {
  const { token, cookies, delay, verbose, json, project } = options;

  const client = new ChatGPTClient(token, { verbose, cookies });
  const storage = new StorageService('./chatgpt-export');
  const service = new BackupService(client, storage);

  const spinner = ora('Authenticating...').start();

  try {
    await client.initialize();

    let conversations;

    if (project) {
      spinner.text = 'Resolving project...';
      const { gizmoId, name } = await service.resolveProjectId(project);
      spinner.text = `Fetching conversations from project "${name}"...`;

      let lastReported = 0;
      conversations = await service.listProjectConversations(gizmoId, {
        delay,
        onListProgress: (fetched, total) => {
          if (fetched !== lastReported) {
            spinner.text = `Fetching conversations from "${name}"... ${fetched}`;
            lastReported = fetched;
          }
        },
      });

      spinner.succeed(`Found ${conversations.length} conversations in project "${name}"`);
    } else {
      spinner.text = 'Fetching conversations...';

      let lastReported = 0;
      conversations = await service.listConversations({
        delay,
        onListProgress: (fetched, total) => {
          if (fetched !== lastReported) {
            spinner.text = `Fetching conversations... ${fetched}/${total}`;
            lastReported = fetched;
          }
        },
      });

      spinner.succeed(`Found ${conversations.length} conversations`);
    }

    if (json) {
      console.log(JSON.stringify(conversations, null, 2));
    } else {
      console.log();
      for (const conv of conversations) {
        const title = conv.title ?? chalk.dim('(untitled)');
        const date = conv.update_time
          ? new Date(
              typeof conv.update_time === 'number'
                ? conv.update_time * 1000
                : conv.update_time
            ).toLocaleDateString()
          : 'unknown date';

        console.log(`${chalk.cyan(conv.id)} ${title} ${chalk.dim(`[${date}]`)}`);
      }
      console.log();
      console.log(chalk.green(`Total: ${conversations.length} conversations`));
    }
  } catch (error) {
    spinner.fail('Failed to list conversations');

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
