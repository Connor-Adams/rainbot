import { Response } from 'express';
import { formatError } from './format';
import { logErrorWithStack } from './logging';
import { createLogger } from '@rainbot/shared';

const log = createLogger('REQUEST-ERROR');

/**
 * Format an error response for API requests
 */
export function formatErrorResponse(err: unknown): { status: 'error'; message: string } {
  const info = formatError(err);
  return { status: 'error', message: info.message };
}

/**
 * Log and send an error response for a request
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  err: unknown,
  context?: string
): void {
  const response = formatErrorResponse(err);
  if (context) {
    logErrorWithStack(log, `${context} error`, err);
  }
  res.status(statusCode).json(response);
}
