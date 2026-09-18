#!/usr/bin/env node

import { createCli } from './cli/index.js';
import { logger } from './utils/logger.js';

process.on('SIGINT', () => {
  logger.info('Received SIGINT, exiting');
  process.exit(130);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
  process.exit(1);
});

const program = createCli();
program.parse();
