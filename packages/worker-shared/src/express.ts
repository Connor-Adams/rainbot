import type { Request, Response } from 'express';
import express, { Express } from 'express';

/** Logger interface for server start (at least .info) */
export interface WorkerServerLogger {
  info: (msg: string) => void;
}

/** Options for worker health /ready endpoint */
export interface WorkerHealthOptions {
  botType: string;
  getReady: () => boolean;
  getQueueReady?: () => boolean;
}

let serverStarted = false;

/**
 * Create an Express app with JSON middleware configured
 */
export function createWorkerExpressApp(): Express {
  const app = express();
  app.use(express.json());
  return app;
}

/**
 * Mount GET /health/live and GET /health/ready on the app.
 * /health/live returns 200 OK.
 * /health/ready returns JSON: status, uptime, botType, ready, degraded, optional queueReady, timestamp.
 */
export function addWorkerHealthRoutes(app: Express, options: WorkerHealthOptions): void {
  const { botType, getReady, getQueueReady } = options;

  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  app.get('/health/ready', (_req: Request, res: Response) => {
    const ready = getReady();
    const body: {
      status: string;
      uptime: number;
      botType: string;
      ready: boolean;
      degraded: boolean;
      queueReady?: boolean;
      timestamp: number;
    } = {
      status: 'ok',
      uptime: process.uptime(),
      botType,
      ready,
      degraded: !ready,
      timestamp: Date.now(),
    };
    if (getQueueReady !== undefined) {
      body.queueReady = getQueueReady();
    }
    res.json(body);
  });
}

/**
 * Start the HTTP server once (guarded by module-level serverStarted).
 * Logs when listening.
 */
export function startWorkerServer(app: Express, port: number, log: WorkerServerLogger): void {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(port, () => {
    log.info(`Worker server listening on port ${port}`);
  });
}
