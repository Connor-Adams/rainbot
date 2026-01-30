import { initTRPC, TRPCError } from '@trpc/server';
import type { Request, Response } from 'express';

export interface RPCContext {
  req: Request;
  res: Response;
  internalSecret: string | null;
}

export function createContext({ req, res }: { req: Request; res: Response }): RPCContext {
  const headerValue = req.header('x-internal-secret') || req.header('x-worker-secret') || null;
  return {
    req,
    res,
    internalSecret: typeof headerValue === 'string' ? headerValue : null,
  };
}

export const t = initTRPC.context<RPCContext>().create();

export const requireInternalSecret = t.middleware(({ ctx, next }) => {
  const expectedSecret = process.env['INTERNAL_RPC_SECRET'] || process.env['WORKER_SECRET'];
  if (!expectedSecret || ctx.internalSecret !== expectedSecret) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Invalid internal secret',
    });
  }
  return next();
});

export const publicProcedure = t.procedure;
export const internalProcedure = t.procedure.use(requireInternalSecret);
