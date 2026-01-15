import type { StatusResponse } from '@rainbot/worker-protocol';

import { internalProcedure, t } from '../trpc';

export const hungerbotRouter = t.router({
  health: internalProcedure.query(() => ({ ok: true, service: 'hungerbot' })),
  getState: internalProcedure.query((): StatusResponse => {
    // TODO: Wire real hungerbot state once internal RPC is adopted for status queries.
    return {
      connected: false,
      playing: false,
    };
  }),
});
