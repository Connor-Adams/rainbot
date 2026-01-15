import type { StatusResponse } from '@rainbot/worker-protocol';

import { internalProcedure, t } from '../trpc';

export const pranjeetRouter = t.router({
  health: internalProcedure.query(() => ({ ok: true, service: 'pranjeet' })),
  getState: internalProcedure.query((): StatusResponse => {
    // TODO: Wire real pranjeet state once internal RPC is adopted for status queries.
    return {
      connected: false,
      playing: false,
    };
  }),
});
