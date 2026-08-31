import { createLogger } from '@rainbot/shared';
import { logErrorWithStack } from './logging';

/** Grace period so the logger can flush before the process goes away. */
const EXIT_DELAY_MS = 250;

/**
 * Setup process-level error handlers for unhandled rejections and uncaught exceptions
 *
 * An uncaught exception leaves the process in an undefined state — a worker that
 * keeps running after one is typically half-dead (e.g. its voice websocket is
 * gone) and has to be rebooted by hand. Exit instead and let the platform
 * restart a clean process.
 */
export function setupProcessErrorHandlers(logger: ReturnType<typeof createLogger>): void {
  process.on('unhandledRejection', (reason) => {
    logErrorWithStack(logger, 'Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (error) => {
    logErrorWithStack(logger, 'Uncaught exception', error);
    setTimeout(() => process.exit(1), EXIT_DELAY_MS).unref();
  });
}
