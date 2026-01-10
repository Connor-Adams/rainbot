import winston from 'winston';
declare const logger: winston.Logger;
export interface Logger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  http: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}
export declare function createLogger(context: string): Logger;
export { logger };
//# sourceMappingURL=logger.d.ts.map
