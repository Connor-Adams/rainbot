'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
const winston_1 = __importDefault(require('winston'));
const path_1 = __importDefault(require('path'));
const fs_1 = __importDefault(require('fs'));
const { combine, timestamp, printf, colorize, errors } = winston_1.default.format;
// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};
// Colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  http: 'magenta',
  debug: 'gray',
};
winston_1.default.addColors(colors);
// Custom format for console output
const consoleFormat = printf((info) => {
  const { level, message, timestamp: ts, context, stack } = info;
  const ctx = context ? ` [${context}]` : '';
  const msg = stack || message;
  return `${ts} ${level}${ctx} ${msg}`;
});
/**
 * Sanitize log messages to avoid leaking sensitive information such as passwords.
 * This function performs targeted redaction on known patterns (e.g. Redis URLs).
 */
function sanitizeLogMessage(message) {
  let sanitized = message;
  // Mask credentials in Redis URLs: redis://user:password@host:port or redis://:password@host:port
  // Keeps the user (if any) and host visible, but replaces the password with "****".
  sanitized = sanitized.replace(/(redis:\/\/[^:\s]*:)[^@\s]+@/gi, '$1****@');
  return sanitized;
}
// Create the logger
const logger = winston_1.default.createLogger({
  levels,
  level: process.env['LOG_LEVEL'] || 'debug',
  format: combine(errors({ stack: true }), timestamp({ format: 'HH:mm:ss' })),
  transports: [
    // Console transport with colors
    new winston_1.default.transports.Console({
      format: combine(colorize({ all: true }), consoleFormat),
    }),
    // File transport for errors only
    new winston_1.default.transports.File({
      filename: path_1.default.join(__dirname, '..', '..', 'logs', 'error.log'),
      level: 'error',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        printf((info) => {
          const { level, message, timestamp: ts, context, stack } = info;
          const ctx = context ? ` [${context}]` : '';
          const msg = stack || message;
          return `${ts} ${level.toUpperCase()}${ctx} ${msg}`;
        })
      ),
    }),
  ],
});
exports.logger = logger;
// Helper to create child logger with context
function createLogger(context) {
  return {
    error: (message, meta = {}) => logger.error(sanitizeLogMessage(message), { context, ...meta }),
    warn: (message, meta = {}) => logger.warn(sanitizeLogMessage(message), { context, ...meta }),
    info: (message, meta = {}) => logger.info(sanitizeLogMessage(message), { context, ...meta }),
    http: (message, meta = {}) => logger.http(sanitizeLogMessage(message), { context, ...meta }),
    debug: (message, meta = {}) => logger.debug(sanitizeLogMessage(message), { context, ...meta }),
  };
}
// Ensure logs directory exists (go up 2 levels from dist/utils/ to project root)
const logsDir = path_1.default.join(__dirname, '..', '..', 'logs');
if (!fs_1.default.existsSync(logsDir)) {
  fs_1.default.mkdirSync(logsDir, { recursive: true });
}
//# sourceMappingURL=logger.js.map
