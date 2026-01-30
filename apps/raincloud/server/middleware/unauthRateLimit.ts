import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createLogger } from '@utils/logger';

const log = createLogger('UNAUTH_RATE_LIMIT');

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

function normalizeNumber(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isAuthenticated(req: Request): boolean {
  return typeof req.isAuthenticated === 'function' && req.isAuthenticated();
}

export const unauthRateLimiter = rateLimit({
  windowMs: normalizeNumber(process.env['UNAUTH_RATE_LIMIT_WINDOW_MS'], DEFAULT_WINDOW_MS),
  max: normalizeNumber(process.env['UNAUTH_RATE_LIMIT_MAX'], DEFAULT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isAuthenticated(req),
  handler: (req: Request, res: Response, _next: NextFunction, options) => {
    log.warn(`Unauth rate limit exceeded for ${req.ip} ${req.method} ${req.originalUrl}`);
    res.status(options.statusCode).json({ error: 'Too many unauthenticated requests' });
  },
});
