import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '../../utils/logger';
import * as stats from '../../utils/statistics';

const log = createLogger('HTTP');

interface RequestWithContext extends Request {
  requestId?: string;
  user?: { id?: string };
}

export default function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  (req as RequestWithContext).requestId = requestId;
  res.locals.requestId = requestId;

  const start = Date.now();
  const { method, originalUrl, ip } = req;
  const userAgent = req.get('user-agent') || '-';
  const userId = (req as RequestWithContext).user?.id || '-';

  // Log incoming request
  log.debug(`ƒ+' ${method} ${originalUrl} from ${ip} req=${requestId} user=${userId}`);

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const size = res.get('content-length') || '-';
    const message = `ƒ+? ${method} ${originalUrl} ${status} ${duration}ms ${size}b req=${requestId} user=${userId}`;
    const requestSize = parseInt(req.get('content-length') || '', 10);
    const responseSize = parseInt(res.get('content-length') || '', 10);
    const endpoint = originalUrl.split('?')[0] || originalUrl;

    if (status >= 500) {
      log.error(message, { ip, userAgent });
    } else if (status >= 400) {
      log.warn(message);
    } else {
      log.http(message);
    }

    if (endpoint.startsWith('/api/')) {
      stats.trackApiLatency(
        endpoint,
        method,
        duration,
        Number.isNaN(status) ? null : status,
        (req as RequestWithContext).user?.id || null,
        Number.isNaN(requestSize) ? null : requestSize,
        Number.isNaN(responseSize) ? null : responseSize
      );
    }
  });

  next();
}
