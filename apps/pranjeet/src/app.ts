import * as trpcExpress from '@trpc/server/adapters/express';
import {
  createWorkerExpressApp,
  createWorkerAuthMiddleware,
  addWorkerHealthRoutes,
  startWorkerServer,
} from '@rainbot/worker-shared';
import { createContext } from '@rainbot/rpc';
import type { PranjeetRouter } from '@rainbot/rpc';
import { log, PORT, WORKER_SECRET, hasToken } from './config';
import { guildStates } from './state/guild-state';
import { getQueueReady } from './queue/tts-worker';

export interface CreateAppOptions {
  router: PranjeetRouter;
  getClient: () => { isReady: () => boolean };
}

export function createApp(options: CreateAppOptions) {
  const { router, getClient } = options;

  const app = createWorkerExpressApp();
  app.use(createWorkerAuthMiddleware(WORKER_SECRET));
  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router,
      createContext,
    })
  );

  addWorkerHealthRoutes(app, {
    botType: 'pranjeet',
    getReady: () => hasToken && getClient().isReady(),
    getQueueReady: () => getQueueReady(),
  });

  function startServer(): void {
    startWorkerServer(app, PORT, log);
  }

  return { app, startServer, guildStates };
}
