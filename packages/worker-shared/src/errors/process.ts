import { createLogger } from '@rainbot/shared';
import { logErrorWithStack } from './logging';

/**
 * Setup process-level error handlers for unhandled rejections and uncaught exceptions
 */
export function setupProcessErrorHandlers(logger: ReturnType<typeof createLogger>): void {
  process.on('unhandledRejection', (reason) => {
    logErrorWithStack(logger, 'Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (error) => {
    logErrorWithStack(logger, 'Uncaught exception', error);
    process.exitCode = 1;
  });
}
