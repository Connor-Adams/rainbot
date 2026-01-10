import winston from 'winston';
import path from 'path';
import fs from 'fs';

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

// Determine logs directory - for monorepo, use project root
const logsDir = process.env['LOGS_DIR'] || path.join(process.cwd(), 'logs');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create the logger
const logger = winston.createLogger({
  levels,
  level: process.env['LOG_LEVEL'] || 'debug',
  format: combine(errors({ stack: true }), timestamp({ format: 'HH:mm:ss' })),
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: combine(colorize({ all: true }), consoleFormat),
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
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

/**
 * Helper to create child logger with context
 * @param context The context name for the logger (e.g., 'MAIN', 'WORKER', 'API')
 */
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

export { logger };
