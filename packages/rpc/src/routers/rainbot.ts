import type { StatusResponse } from '@rainbot/worker-protocol';

import { internalProcedure, t } from '../trpc';

export const rainbotRouter = t.router({
  health: internalProcedure.query(() => ({ ok: true, service: 'rainbot' })),
  getState: internalProcedure.query((): StatusResponse => {
    // TODO: Wire real rainbot state once internal RPC is adopted for status queries.
    return {
      connected: false,
      playing: false,
    };
  }),
});
