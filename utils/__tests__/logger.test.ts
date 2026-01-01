import { createLogger } from '../logger';
import winston from 'winston';

// Mock winston to capture log calls
jest.mock('winston', () => {
  const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    debug: jest.fn(),
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn((...args) => args),
      timestamp: jest.fn((opts) => opts),
      printf: jest.fn((fn) => fn),
      colorize: jest.fn((opts) => opts),
      errors: jest.fn((opts) => opts),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
    addColors: jest.fn(),
  };
});

// Mock fs to prevent actual file system operations
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
}));

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLogger', () => {
    it('creates a logger with the specified context', () => {
      const logger = createLogger('TEST_CONTEXT');

      expect(logger).toBeDefined();
      expect(logger.error).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.http).toBeInstanceOf(Function);
      expect(logger.debug).toBeInstanceOf(Function);
    });

    it('logs error messages with context', () => {
      const logger = createLogger('ERROR_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.error('Test error message');

      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'Test error message',
        expect.objectContaining({ context: 'ERROR_TEST' })
      );
    });

    it('logs warn messages with context', () => {
      const logger = createLogger('WARN_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.warn('Test warning message');

      expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
        'Test warning message',
        expect.objectContaining({ context: 'WARN_TEST' })
      );
    });

    it('logs info messages with context', () => {
      const logger = createLogger('INFO_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info('Test info message');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Test info message',
        expect.objectContaining({ context: 'INFO_TEST' })
      );
    });

    it('logs http messages with context', () => {
      const logger = createLogger('HTTP_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.http('Test HTTP message');

      expect(mockWinstonLogger.http).toHaveBeenCalledWith(
        'Test HTTP message',
        expect.objectContaining({ context: 'HTTP_TEST' })
      );
    });

    it('logs debug messages with context', () => {
      const logger = createLogger('DEBUG_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.debug('Test debug message');

      expect(mockWinstonLogger.debug).toHaveBeenCalledWith(
        'Test debug message',
        expect.objectContaining({ context: 'DEBUG_TEST' })
      );
    });

    it('includes additional metadata in log messages', () => {
      const logger = createLogger('META_TEST');
      const mockWinstonLogger = (winston as any).createLogger();
      const metadata = { userId: '123', action: 'test' };

      logger.info('Test with metadata', metadata);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Test with metadata',
        expect.objectContaining({
          context: 'META_TEST',
          userId: '123',
          action: 'test',
        })
      );
    });

    it('sanitizes Redis URLs with credentials', () => {
      const logger = createLogger('REDIS_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info('Connecting to redis://user:password123@localhost:6379');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Connecting to redis://user:****@localhost:6379',
        expect.objectContaining({ context: 'REDIS_TEST' })
      );
    });

    it('sanitizes Redis URLs without username', () => {
      const logger = createLogger('REDIS_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info('Connecting to redis://:password123@localhost:6379');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Connecting to redis://:****@localhost:6379',
        expect.objectContaining({ context: 'REDIS_TEST' })
      );
    });

    it('sanitizes multiple Redis URLs in the same message', () => {
      const logger = createLogger('REDIS_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info(
        'Primary: redis://:pass1@host1:6379, Secondary: redis://user:pass2@host2:6379'
      );

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Primary: redis://:****@host1:6379, Secondary: redis://user:****@host2:6379',
        expect.objectContaining({ context: 'REDIS_TEST' })
      );
    });

    it('does not modify messages without sensitive data', () => {
      const logger = createLogger('NORMAL_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info('Normal message without sensitive data');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Normal message without sensitive data',
        expect.objectContaining({ context: 'NORMAL_TEST' })
      );
    });

    it('handles empty metadata gracefully', () => {
      const logger = createLogger('EMPTY_META_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info('Test message', {});

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({ context: 'EMPTY_META_TEST' })
      );
    });

    it('creates different logger instances for different contexts', () => {
      const logger1 = createLogger('CONTEXT_1');
      const logger2 = createLogger('CONTEXT_2');

      expect(logger1).not.toBe(logger2);
    });

    it('handles case-insensitive Redis URL sanitization', () => {
      const logger = createLogger('REDIS_CASE_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info('Connecting to REDIS://user:password@localhost:6379');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Connecting to REDIS://user:****@localhost:6379',
        expect.objectContaining({ context: 'REDIS_CASE_TEST' })
      );
    });

    it('preserves host and port in sanitized Redis URLs', () => {
      const logger = createLogger('REDIS_HOST_TEST');
      const mockWinstonLogger = (winston as any).createLogger();

      logger.info('redis://user:secret@redis.example.com:6380/1');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'redis://user:****@redis.example.com:6380/1',
        expect.objectContaining({ context: 'REDIS_HOST_TEST' })
      );
    });
  });
});
