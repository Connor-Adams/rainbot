const winston = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = winston.format;

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

winston.addColors(colors);

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, context, stack }) => {
    const ctx = context ? ` [${context}]` : '';
    const msg = stack || message;
    return `${timestamp} ${level}${ctx} ${msg}`;
});

// Create the logger
const logger = winston.createLogger({
    levels,
    level: process.env.LOG_LEVEL || 'debug',
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'HH:mm:ss' })
    ),
    transports: [
        // Console transport with colors
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                consoleFormat
            ),
        }),
        // File transport for errors only
        new winston.transports.File({
            filename: path.join(__dirname, '..', 'logs', 'error.log'),
            level: 'error',
            format: combine(
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                printf(({ level, message, timestamp, context, stack }) => {
                    const ctx = context ? ` [${context}]` : '';
                    const msg = stack || message;
                    return `${timestamp} ${level.toUpperCase()}${ctx} ${msg}`;
                })
            ),
        }),
    ],
});

// Helper to create child logger with context
function createLogger(context) {
    return {
        error: (message, meta = {}) => logger.error(message, { context, ...meta }),
        warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
        info: (message, meta = {}) => logger.info(message, { context, ...meta }),
        http: (message, meta = {}) => logger.http(message, { context, ...meta }),
        debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
    };
}

// Ensure logs directory exists
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = {
    logger,
    createLogger,
};

