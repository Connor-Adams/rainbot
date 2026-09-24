import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { TRPCError } from '@trpc/server';
import { RainbotAttr } from '@rainbot/observability/node';
import { t, publicProcedure, internalProcedure, withRpcSpan, type RPCContext } from '../trpc';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);

  // Production registers this via `NodeSDK.start()` (see
  // `@rainbot/observability`'s `startTelemetry`). Without a real context
  // manager, `context.active()` always returns `ROOT_CONTEXT` and
  // `trace.getActiveSpan()` inside `withRpcSpan` would silently find
  // nothing — the fix's `trace.getActiveSpan()` call needs this to
  // exercise the same context propagation the production code relies on.
  context.setGlobalContextManager(new AsyncHooksContextManager().enable());
});

afterEach(() => exporter.reset());

function fakeContext(internalSecret: string | null): RPCContext {
  return {
    req: {} as unknown as RPCContext['req'],
    res: {} as unknown as RPCContext['res'],
    internalSecret,
  };
}

describe('worker.rpc.handler server span', () => {
  it('names the span "worker.rpc.handler" and carries the procedure path', async () => {
    const router = t.router({
      ping: publicProcedure.query(() => 'pong'),
    });
    const createCaller = t.createCallerFactory(router);
    const caller = createCaller(fakeContext(null));

    const result = await caller.ping();

    expect(result).toBe('pong');
    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('worker.rpc.handler');
    expect(span.attributes[RainbotAttr.rpcProcedure]).toBe('ping');
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  // F11: raincloud polls `health` every 15s per worker; left spanned, nearly
  // every root trace in Tempo would be a health check instead of real RPC
  // traffic. See the matching client-side exclusion in client.telemetry.test.ts.
  it('does not span the health procedure, but still resolves it normally', async () => {
    const router = t.router({
      health: publicProcedure.query(() => ({ ok: true })),
    });
    const createCaller = t.createCallerFactory(router);
    const caller = createCaller(fakeContext(null));

    const result = await caller.health();

    expect(result).toEqual({ ok: true });
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it('propagates an error thrown by a procedure as the same instance', async () => {
    // Call the middleware function directly with a `next` that rejects,
    // bypassing tRPC's own call machinery — going through a real router
    // would not isolate this: tRPC's `createProcedureCaller` re-wraps any
    // thrown, non-TRPCError value via `getTRPCErrorFromUnknown` before it
    // ever reaches the caller, so identity is lost there regardless of what
    // this middleware does. Testing the middleware directly is the only way
    // to verify *this* code doesn't itself wrap, replace, or swallow errors.
    const [middlewareFn] = withRpcSpan._middlewares;
    const originalError = new Error('worker handler exploded');
    const next = jest.fn().mockRejectedValue(originalError);
    const opts = {
      ctx: fakeContext(null),
      type: 'query',
      path: 'boom',
      input: undefined,
      rawInput: undefined,
      meta: undefined,
      next,
    } as unknown as Parameters<typeof middlewareFn>[0];

    let caught: unknown;
    try {
      await middlewareFn(opts);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(originalError);
    expect(next).toHaveBeenCalledTimes(1);

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('worker.rpc.handler');
    expect(span.attributes[RainbotAttr.rpcProcedure]).toBe('boom');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('spans the unauthorized path too, not only authenticated calls', async () => {
    const previousSecret = process.env['WORKER_SECRET'];
    process.env['WORKER_SECRET'] = 'expected-secret';

    try {
      const router = t.router({
        secure: internalProcedure.query(() => 'ok'),
      });
      const createCaller = t.createCallerFactory(router);
      const caller = createCaller(fakeContext('wrong-secret'));

      let caught: unknown;
      try {
        await caller.secure();
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(TRPCError);
      expect((caught as TRPCError).code).toBe('UNAUTHORIZED');

      const [span] = exporter.getFinishedSpans();
      expect(span.name).toBe('worker.rpc.handler');
      expect(span.attributes[RainbotAttr.rpcProcedure]).toBe('secure');
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
    } finally {
      if (previousSecret === undefined) {
        delete process.env['WORKER_SECRET'];
      } else {
        process.env['WORKER_SECRET'] = previousSecret;
      }
    }
  });

  it('spans a procedure resolver throwing, since it resolves through the same {ok:false} path', async () => {
    const previousSecret = process.env['WORKER_SECRET'];
    process.env['WORKER_SECRET'] = 'expected-secret';

    try {
      const resolverError = new Error('resolver blew up');
      const router = t.router({
        explode: internalProcedure.query(() => {
          throw resolverError;
        }),
      });
      const createCaller = t.createCallerFactory(router);
      const caller = createCaller(fakeContext('expected-secret'));

      let caught: unknown;
      try {
        await caller.explode();
      } catch (error) {
        caught = error;
      }

      // tRPC's caller machinery re-wraps a non-TRPCError throw via
      // getTRPCErrorFromUnknown before it reaches us, so identity isn't
      // preserved here (unlike the direct-middleware test above) — but the
      // original error is still the cause, and the resolved-error path
      // still has to mark the span.
      expect(caught).toBeInstanceOf(TRPCError);
      expect((caught as TRPCError).cause).toBe(resolverError);

      const [span] = exporter.getFinishedSpans();
      expect(span.name).toBe('worker.rpc.handler');
      expect(span.attributes[RainbotAttr.rpcProcedure]).toBe('explode');
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
    } finally {
      if (previousSecret === undefined) {
        delete process.env['WORKER_SECRET'];
      } else {
        process.env['WORKER_SECRET'] = previousSecret;
      }
    }
  });

  it('returns the unauthorized result to tRPC unchanged, proving instrumentation does not alter control flow', async () => {
    const previousSecret = process.env['WORKER_SECRET'];
    process.env['WORKER_SECRET'] = 'expected-secret';

    try {
      const router = t.router({
        secure: internalProcedure.query(() => 'ok'),
      });
      const createCaller = t.createCallerFactory(router);
      const caller = createCaller(fakeContext('wrong-secret'));

      let caught: unknown;
      try {
        await caller.secure();
      } catch (error) {
        caught = error;
      }

      // Same shape a caller would have seen before this middleware ever
      // inspected the result: a TRPCError with the same code and message,
      // not something wrapped, replaced, or resolved instead of thrown.
      expect(caught).toBeInstanceOf(TRPCError);
      const error = caught as TRPCError;
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Invalid internal secret');
    } finally {
      if (previousSecret === undefined) {
        delete process.env['WORKER_SECRET'];
      } else {
        process.env['WORKER_SECRET'] = previousSecret;
      }
    }
  });
});
