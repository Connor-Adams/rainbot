import express, { Express } from 'express';

/**
 * Create an Express app with JSON middleware configured
 */
export function createWorkerExpressApp(): Express {
  const app = express();
  app.use(express.json());
  return app;
}
