import * as trpcExpress from '@trpc/server/adapters/express';
import {
  createWorkerExpressApp,
  createWorkerAuthMiddleware,
  addWorkerHealthRoutes,
  startWorkerServer,
} from '@rainbot/worker-shared';
import { createContext } from '@rainbot/rpc';
import type { HungerbotRouter } from '@rainbot/rpc';
import { log, PORT, WORKER_SECRET, hasToken } from './config';
import { guildStates } from './state/guild-state';

export interface CreateAppOptions {
  router: HungerbotRouter;
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
    botType: 'hungerbot',
    getReady: () => hasToken && getClient().isReady(),
  });

  function startServer(): void {
    startWorkerServer(app, PORT, log);
  }

  return { app, startServer, guildStates };
}
