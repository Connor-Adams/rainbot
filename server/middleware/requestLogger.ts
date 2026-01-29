import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '../../utils/logger';

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
  log.debug(`REQ ${method} ${originalUrl} from ${ip} req=${requestId} user=${userId}`);

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const size = res.get('content-length') || '-';
    const message = `RES ${method} ${originalUrl} ${status} ${duration}ms ${size}b req=${requestId} user=${userId}`;

    if (status >= 500) {
      log.error(message, { ip, userAgent });
    } else if (status >= 400) {
      log.warn(message);
    } else {
      log.http(message);
    }
  });

  next();
}
