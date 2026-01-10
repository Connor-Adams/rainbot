import winston from 'npm:winston@3.13.0';
import { join } from '@std/path';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import { ensureDirSync } from 'https://deno.land/std@0.224.0/fs/ensure_dir.ts';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log levels
const levels: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for each level
const colors: Record<string, string> = {
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  http: 'magenta',
  debug: 'gray',
};

winston.addColors(colors);

// Custom format for console output
const consoleFormat = printf((info) => {
  const {
    level,
    message,
    timestamp: ts,
    context,
    stack,
  } = info as {
    level: string;
    message: string;
    timestamp?: string;
    context?: string;
    stack?: string;
  };
  const ctx = context ? ` [${context}]` : '';
  const msg = stack || message;
  return `${ts} ${level}${ctx} ${msg}`;
});

/**
 * Sanitize log messages to avoid leaking sensitive information such as passwords.
 * This function performs targeted redaction on known patterns (e.g. Redis URLs).
 */
function sanitizeLogMessage(message: string): string {
  let sanitized = message;

  // Mask credentials in Redis URLs: redis://user:password@host:port or redis://:password@host:port
  // Keeps the user (if any) and host visible, but replaces the password with "****".
  sanitized = sanitized.replace(/(redis:\/\/[^:\s]*:)[^@\s]+@/gi, '$1****@');

  return sanitized;
}

// Create the logger
const logger = winston.createLogger({
  levels,
  level: Deno.env.get('LOG_LEVEL') || 'debug',
  format: combine(errors({ stack: true }), timestamp({ format: 'HH:mm:ss' })),
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: combine(colorize({ all: true }), consoleFormat),
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: join(Deno.cwd(), 'logs', 'error.log'),
      level: 'error',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf((info) => {
          const {
            level,
            message,
            timestamp: ts,
            context,
            stack,
          } = info as {
            level: string;
            message: string;
            timestamp?: string;
            context?: string;
            stack?: string;
          };
          const ctx = context ? ` [${context}]` : '';
          const msg = stack || message;
          return `${ts} ${level.toUpperCase()}${ctx} ${msg}`;
        })
      ),
    }),
  ],
});

export interface Logger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  http: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

// Helper to create child logger with context
export function createLogger(context: string): Logger {
  return {
    error: (message: string, meta: Record<string, unknown> = {}) =>
      logger.error(sanitizeLogMessage(message), { context, ...meta }),
    warn: (message: string, meta: Record<string, unknown> = {}) =>
      logger.warn(sanitizeLogMessage(message), { context, ...meta }),
    info: (message: string, meta: Record<string, unknown> = {}) =>
      logger.info(sanitizeLogMessage(message), { context, ...meta }),
    http: (message: string, meta: Record<string, unknown> = {}) =>
      logger.http(sanitizeLogMessage(message), { context, ...meta }),
    debug: (message: string, meta: Record<string, unknown> = {}) =>
      logger.debug(sanitizeLogMessage(message), { context, ...meta }),
  };
}

// Ensure logs directory exists (from apps/raincloud/utils/ go up 3 levels to project root)
const logsDir = join(Deno.cwd(), 'logs');
if (!existsSync(logsDir)) {
  ensureDirSync(logsDir);
}

export { logger };
