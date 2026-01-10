import express, { type Request, type Response, type Express } from 'express';
import { createLogger } from './logger.ts';

const log = createLogger('WorkerServer');

export interface WorkerServerOptions {
  healthReady?: () => boolean | Promise<boolean>;
  readyInfo?: () => Record<string, unknown>;
  port: number;
  onStart?: (app: Express) => void;
}

/**
 * Creates a standard Express server for a worker bot, with health endpoints and JSON body parsing.
 * Usage: import { createWorkerServer } from 'utils/workerServer';
 */
export function createWorkerServer({ healthReady, readyInfo, port, onStart }: WorkerServerOptions) {
  const app = express();
  app.use(express.json() as any);

  // /health/live endpoint (plain text OK)
  app.get('/health/live', (_req: Request, res: Response) => {
    (res as any).status(200).type('text/plain').send('OK');
  });

  // /health/ready endpoint (JSON, 200 if ready, 503 if not)
  app.get('/health/ready', async (_req: Request, res: Response) => {
    let ready = true;
    if (healthReady) {
      try {
        ready = await healthReady();
      } catch {
        ready = false;
      }
    }
    (res as any).status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'starting',
      uptime: performance.now(),
      ...((readyInfo && readyInfo()) || {}),
      timestamp: Date.now(),
    });
  });

  // Start server
  app.listen(port, () => {
    log.info(`Listening on port ${port}`, { port });
    if (onStart) onStart(app);
  });

  return app;
}
