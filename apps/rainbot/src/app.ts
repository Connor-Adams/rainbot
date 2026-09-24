import * as trpcExpress from '@trpc/server/adapters/express';
import {
  addWorkerHealthRoutes,
  createWorkerAuthMiddleware,
  createWorkerExpressApp,
  startWorkerServer,
} from '@rainbot/worker-shared';
import { createContext } from '@rainbot/rpc';
import type { RainbotRouter } from '@rainbot/rpc';
import { hasToken, log, PORT, WORKER_SECRET } from './config';
import { guildStates } from './state/guild-state';

export interface CreateAppOptions {
  router: RainbotRouter;
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
    botType: 'rainbot',
    getReady: () => hasToken && getClient().isReady(),
  });

  function startServer(): void {
    startWorkerServer(app, PORT, log);
  }

  return { app, startServer, guildStates };
}
