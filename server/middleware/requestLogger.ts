import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../utils/logger';

const log = createLogger('HTTP');

export default function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl, ip } = req;
  const userAgent = req.get('user-agent') || '-';

  // Log incoming request
  log.debug(`→ ${method} ${originalUrl} from ${ip}`);

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const size = res.get('content-length') || '-';
    const message = `← ${method} ${originalUrl} ${status} ${duration}ms ${size}b`;

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
