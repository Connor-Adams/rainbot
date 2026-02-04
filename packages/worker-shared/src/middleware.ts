import type { Request, Response, NextFunction } from 'express';

/**
 * Create Express middleware that requires x-internal-secret or x-worker-secret
 * for all requests except those to /health/*.
 * Returns 503 if workerSecret is not configured, 401 if the header is missing or wrong.
 */
export function createWorkerAuthMiddleware(workerSecret: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith('/health')) {
      next();
      return;
    }

    const secret = req.header('x-internal-secret') || req.header('x-worker-secret');
    if (workerSecret && secret === workerSecret) {
      next();
      return;
    }

    if (!workerSecret) {
      res.status(503).json({ error: 'Worker secret not configured' });
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  };
}
