import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../utils/logger';

export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function statsErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err.name === 'ValidationError') {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err.message.includes('Invalid date')) {
    res.status(400).json({ error: err.message });
    return;
  }

  const requestId = res.locals?.requestId || '-';
  log.error(`Stats API Error: ${err.message}`, { requestId });
  res.status(500).json({ error: err.message || 'Internal server error' });
}

export function apiErrorHandler(
  err: Error | HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof HttpError ? err.message : getErrorMessage(err);
  const requestId = res.locals?.requestId || '-';
  log.error(`API Error: ${message}`, { status, requestId });
  const payload: { error: string; code?: string } = { error: message };
  if (err instanceof HttpError && err.code) {
    payload.code = err.code;
  }
  res.status(status).json(payload);
}
const log = createLogger('ERROR_HANDLER');
