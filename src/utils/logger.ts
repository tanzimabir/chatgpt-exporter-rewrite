import fs from 'node:fs';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

class Logger {
  private logFilePath: string | null = null;
  private verboseFlag = false;

  configure(opts: { logFile?: string; verbose?: boolean }): void {
    this.logFilePath = opts.logFile ?? null;
    this.verboseFlag = opts.verbose ?? false;
  }

  private write(entry: LogEntry): void {
    const line = JSON.stringify(entry);
    // Always write to log file if configured
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, line + '\n', 'utf-8');
      } catch {
        // ignore file errors
      }
    }
    // Console output only for verbose
    if (this.verboseFlag) {
      const ts = entry.timestamp.slice(11, 19); // HH:MM:SS
      const prefix = `[${ts}] ${entry.level.toUpperCase().padEnd(5)}`;
      if (entry.level === 'error') {
        console.error(`${prefix} ${entry.message}`);
      } else if (entry.level === 'warn') {
        console.warn(`${prefix} ${entry.message}`);
      } else {
        console.log(`${prefix} ${entry.message}`);
      }
    }
  }

  debug(message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'debug', message, data });
  }

  info(message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'info', message, data });
  }

  warn(message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'warn', message, data });
  }

  error(message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'error', message, data });
  }
}

export const logger = new Logger();
