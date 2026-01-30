import winston from 'winston';
import path from 'path';
import fs from 'fs';
import type { Logger } from '@rainbot/types/core';
export type { Logger } from '@rainbot/types/core';

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

// Console format: use colors only when stdout is a TTY (avoids broken output in Railway/containers)
const isTty = typeof process.stdout?.isTTY === 'boolean' && process.stdout.isTTY;
const consoleTransportFormat = isTty
  ? combine(colorize({ all: true }), consoleFormat)
  : combine(consoleFormat);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: consoleTransportFormat,
  }),
];

// File transport only when logs dir is writable (e.g. skip in read-only containers)
try {
  const logsDir = path.join(__dirname, '..', '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const errorLogPath = path.join(logsDir, 'error.log');
  transports.push(
    new winston.transports.File({
      filename: errorLogPath,
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
    })
  );
} catch {
  // Logs dir not writable (e.g. Railway); console only
}

const logger = winston.createLogger({
  levels,
  level: process.env['LOG_LEVEL'] || 'info',
  format: combine(errors({ stack: true }), timestamp({ format: 'HH:mm:ss' })),
  transports,
});

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

export { logger };
