import { initTRPC, TRPCError } from '@trpc/server';
import type { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { withSpan, RainbotAttr } from '@rainbot/observability/node';

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

/**
 * Server-side counterpart to the client's `worker.rpc` span (`client.ts`),
 * deliberately named `worker.rpc.handler` so the two are distinguishable in
 * Tempo. Context propagation from the client already works automatically —
 * `@opentelemetry/instrumentation-undici` (part of the default
 * `getNodeAutoInstrumentations()` bundle) instruments the `fetch` call
 * `httpBatchLink` makes and injects a `traceparent` header, so this span
 * parents correctly off the incoming request without any manual propagation
 * code here. What this middleware adds is naming and timing: without it,
 * every worker request shows up as a generic "HTTP POST /trpc" span with no
 * indication of which procedure ran.
 *
 * Applied to `t.procedure` directly (see `publicProcedure` below), before
 * `requireInternalSecret`, so an unauthorized call is spanned too — a
 * `WORKER_SECRET` mismatch is a known production failure mode and exactly
 * the case that should stay visible, not just successful authenticated
 * calls.
 *
 * tRPC's own middleware recursion catches every downstream throw — from
 * `requireInternalSecret` or from a procedure resolver — and resolves
 * `next()` to `{ ok: false, error }` instead of rejecting; it only rethrows
 * once, at the very top, outside any middleware's `next()` call. So a real
 * auth failure or application error never makes `next()` reject, and
 * `withSpan`'s try/catch never sees it. We inspect the resolved result
 * ourselves and mark the active span as an error when `ok` is false, without
 * altering what this middleware returns to tRPC.
 *
 * `health` (and any future equivalent status procedure) is excluded: raincloud
 * polls it every 15s per worker, which would otherwise make nearly every root
 * trace in Tempo a health check instead of real RPC traffic. See the matching
 * exclusion on the client side in client.ts.
 */
const UNTRACED_PROCEDURES = new Set(['health']);

export const withRpcSpan = t.middleware(({ path, next }) => {
  if (UNTRACED_PROCEDURES.has(path)) {
    return next();
  }
  return withSpan('worker.rpc.handler', { [RainbotAttr.rpcProcedure]: path }, async () => {
    const result = await next();
    if (!result.ok) {
      const span = trace.getActiveSpan();
      if (span) {
        span.recordException(result.error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: result.error.message });
      }
    }
    return result;
  });
});

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

export const publicProcedure = t.procedure.use(withRpcSpan);
export const internalProcedure = publicProcedure.use(requireInternalSecret);
