import { Express } from 'express';
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
export declare function createWorkerServer({
  healthReady,
  readyInfo,
  port,
  onStart,
}: WorkerServerOptions): import('express-serve-static-core').Express;
//# sourceMappingURL=workerServer.d.ts.map
