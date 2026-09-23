import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { TRPCError } from '@trpc/server';
import { RainbotAttr } from '@rainbot/observability/node';
import { t, publicProcedure, internalProcedure, withRpcSpan, type RPCContext } from '../trpc';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
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

      await expect(caller.secure()).rejects.toBeInstanceOf(TRPCError);

      const [span] = exporter.getFinishedSpans();
      expect(span.name).toBe('worker.rpc.handler');
      expect(span.attributes[RainbotAttr.rpcProcedure]).toBe('secure');
    } finally {
      if (previousSecret === undefined) {
        delete process.env['WORKER_SECRET'];
      } else {
        process.env['WORKER_SECRET'] = previousSecret;
      }
    }
  });
});
