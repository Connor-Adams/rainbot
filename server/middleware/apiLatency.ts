import type { Request, Response, NextFunction } from 'express';
import * as stats from '../../utils/statistics';

interface RequestWithUser extends Request {
  user?: { id?: string };
}

function parseSize(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export default function apiLatencyTracker(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.originalUrl.startsWith('/api/')) {
    next();
    return;
  }

  const start = Date.now();
  const endpoint = req.originalUrl;
  const method = req.method.toUpperCase();
  const requestSizeBytes = parseSize(req.get('content-length'));

  res.on('finish', () => {
    const responseTimeMs = Date.now() - start;
    const statusCode = res.statusCode || null;
    const responseSizeBytes = parseSize(res.get('content-length'));
    const userId = (req as RequestWithUser).user?.id || null;

    stats.trackApiLatency(
      endpoint,
      method,
      responseTimeMs,
      statusCode,
      userId,
      requestSizeBytes,
      responseSizeBytes
    );
  });

  next();
}
