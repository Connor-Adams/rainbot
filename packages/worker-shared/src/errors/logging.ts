import { createLogger } from '@rainbot/shared';
import { formatError } from './format';

/**
 * Log an error with stack trace if available
 */
export function logErrorWithStack(
  logger: ReturnType<typeof createLogger>,
  message: string,
  err: unknown
): void {
  const info = formatError(err);
  logger.error(`${message}: ${info.message}`);
  if (info.stack) {
    logger.debug(info.stack);
  }
}
