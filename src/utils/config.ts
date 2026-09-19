import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { logger } from './logger.js';

export interface ExporterConfig {
  token?: string;
  cookies?: string;
  tokenFile?: string;
  cookiesFile?: string;
  output: string;
  format: string[];
  concurrency: number;
  delay: number;
  timeout: {
    api: number;
    download: number;
  };
  backup: {
    incremental: boolean;
    downloadFiles: boolean;
    includeProjects: boolean;
    excludeProjects: string[];
    includeSystemMessages: boolean;
    includeToolMessages: boolean;
    includeAllBranches: boolean;
  };
  logging: {
    logFile?: string;
    verbose: boolean;
  };
  advanced: {
    rotateUserAgent: boolean;
    dryRun: boolean;
    resume: boolean;
  };
}

const DEFAULT_CONFIG: ExporterConfig = {
  output: './chatgpt-export',
  format: ['md'],
  concurrency: 3,
  delay: 500,
  timeout: {
    api: 30000,
    download: 120000,
  },
  backup: {
    incremental: false,
    downloadFiles: false,
    includeProjects: true,
    excludeProjects: [],
    includeSystemMessages: false,
    includeToolMessages: false,
    includeAllBranches: true,
  },
  logging: {
    verbose: false,
  },
  advanced: {
    rotateUserAgent: false,
    dryRun: false,
    resume: true,
  },
};

async function findConfigFile(): Promise<string | null> {
  const candidates = [
    '.chatgpt-exporter.yaml',
    '.chatgpt-exporter.yml',
    path.join(process.env.HOME ?? '', '.config', 'chatgpt-exporter', 'config.yaml'),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      // not found
    }
  }
  return null;
}

export async function loadConfig(): Promise<Partial<ExporterConfig>> {
  try {
    const configFile = findConfigFile();
    if (!configFile) return {};

    const raw = await fs.readFile(configFile, 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown>;
    logger.info(`Loaded config from ${configFile}`);
    return flattenConfig(parsed);
  } catch (error) {
    logger.warn('Failed to load config file', error);
    return {};
  }
}

function flattenConfig(raw: Record<string, unknown>): Partial<ExporterConfig> {
  const config: Record<string, unknown> = {};

  // Top-level
  if (raw.token !== undefined) config.token = raw.token;
  if (raw.cookies !== undefined) config.cookies = raw.cookies;
  if (raw.tokenFile !== undefined) config.tokenFile = raw.tokenFile;
  if (raw.cookiesFile !== undefined) config.cookiesFile = raw.cookiesFile;
  if (raw.output !== undefined) config.output = raw.output;
  if (raw.format !== undefined) config.format = raw.format;
  if (raw.concurrency !== undefined) config.concurrency = raw.concurrency;
  if (raw.delay !== undefined) config.delay = raw.delay;

  // Timeout
  if (raw.timeout !== undefined) {
    config.timeout = raw.timeout;
  }

  // Backup
  if (raw.backup !== undefined) {
    config.backup = raw.backup;
  }

  // Logging
  if (raw.logging !== undefined) {
    config.logging = raw.logging;
  }

  // Advanced
  if (raw.advanced !== undefined) {
    config.advanced = raw.advanced;
  }

  return config as Partial<ExporterConfig>;
}

export function mergeConfig(
  defaults: ExporterConfig,
  fileConfig: Partial<ExporterConfig>,
  cliOverrides: Record<string, unknown>
): ExporterConfig {
  // Deep merge: defaults < file < CLI
  const merged = { ...defaults };

  for (const [key, value] of Object.entries(fileConfig)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  for (const [key, value] of Object.entries(cliOverrides)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged as ExporterConfig;
}

export { DEFAULT_CONFIG };
