import { RainbotAttr, withSpan, recordRpcDuration } from '@rainbot/observability/node';

jest.mock('@rainbot/observability/node', () => ({
  ...jest.requireActual('@rainbot/observability/node'),
  withSpan: jest.fn((_name: string, _attrs: unknown, fn: () => unknown) => fn()),
  recordRpcDuration: jest.fn(),
}));

const joinMutate = jest.fn();
const healthQuery = jest.fn();

jest.mock('@trpc/client', () => ({
  ...jest.requireActual('@trpc/client'),
  httpBatchLink: jest.fn(() => ({})),
  createTRPCProxyClient: jest.fn(() => ({
    join: { mutate: joinMutate },
    health: { query: healthQuery },
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createTRPCClient RPC telemetry', () => {
  it('wraps a successful mutate call in a worker.rpc span and records duration', async () => {
    joinMutate.mockResolvedValue({ ok: true });

    const { createTRPCClient } = await import('../client');
    const client = createTRPCClient({
      baseUrl: 'http://rainbot.internal:3001',
      secret: 'shh',
      worker: 'rainbot',
    }) as unknown as { join: { mutate: (input: unknown) => Promise<unknown> } };

    const input = { requestId: 'r1', guildId: 'g1', channelId: 'c1' };
    const result = await client.join.mutate(input);

    expect(result).toEqual({ ok: true });
    expect(joinMutate).toHaveBeenCalledWith(input);

    const expectedAttributes = {
      [RainbotAttr.rpcProcedure]: 'join',
      [RainbotAttr.worker]: 'rainbot',
    };
    expect(withSpan).toHaveBeenCalledWith('worker.rpc', expectedAttributes, expect.any(Function));
    expect(recordRpcDuration).toHaveBeenCalledTimes(1);
    expect(recordRpcDuration).toHaveBeenCalledWith(expect.any(Number), expectedAttributes);
  });

  it('propagates the original error instance and still records duration on failure', async () => {
    const originalError = new Error('worker unreachable');
    healthQuery.mockRejectedValue(originalError);

    const { createTRPCClient } = await import('../client');
    const client = createTRPCClient({
      baseUrl: 'http://pranjeet.internal:3002',
      secret: 'shh',
      worker: 'pranjeet',
    }) as unknown as { health: { query: () => Promise<unknown> } };

    let caught: unknown;
    try {
      await client.health.query();
    } catch (error) {
      caught = error;
    }

    // Identity check: instrumentation must not wrap, replace, or swallow the error.
    expect(caught).toBe(originalError);

    const expectedAttributes = {
      [RainbotAttr.rpcProcedure]: 'health',
      [RainbotAttr.worker]: 'pranjeet',
    };
    expect(withSpan).toHaveBeenCalledWith('worker.rpc', expectedAttributes, expect.any(Function));
    expect(recordRpcDuration).toHaveBeenCalledTimes(1);
    expect(recordRpcDuration).toHaveBeenCalledWith(expect.any(Number), expectedAttributes);
  });
});
