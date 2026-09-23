import { recordWorkerRegistered } from '@rainbot/observability/node';

jest.mock('@rainbot/observability/node', () => ({
  ...jest.requireActual('@rainbot/observability/node'),
  recordWorkerRegistered: jest.fn(),
}));

const originalFetch = global.fetch;

describe('worker registration telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['RAINCLOUD_URL'];
    delete process.env['WORKER_SECRET'];
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('records false when registration is skipped for missing config', async () => {
    const { registerWithOrchestrator } = await import('../orchestrator');

    await registerWithOrchestrator({ botType: 'rainbot' });

    expect(recordWorkerRegistered).toHaveBeenCalledWith('rainbot', false);
  });

  it('records false when RAINCLOUD_URL is invalid', async () => {
    const { registerWithOrchestrator } = await import('../orchestrator');

    await registerWithOrchestrator({
      botType: 'pranjeet',
      raincloudUrl: 'not a url at all::::',
      workerSecret: 'secret',
    });

    expect(recordWorkerRegistered).toHaveBeenCalledWith('pranjeet', false);
  });

  it('records true on a successful registration response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    }) as unknown as typeof fetch;

    const { registerWithOrchestrator } = await import('../orchestrator');

    await registerWithOrchestrator({
      botType: 'hungerbot',
      raincloudUrl: 'http://raincloud.internal:3000',
      workerSecret: 'secret',
    });

    expect(recordWorkerRegistered).toHaveBeenCalledWith('hungerbot', true);
  });

  it('records false when the orchestrator responds with a non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }) as unknown as typeof fetch;

    const { registerWithOrchestrator } = await import('../orchestrator');

    await registerWithOrchestrator({
      botType: 'rainbot',
      raincloudUrl: 'http://raincloud.internal:3000',
      workerSecret: 'secret',
    });

    expect(recordWorkerRegistered).toHaveBeenCalledWith('rainbot', false);
  });

  it('records false once the retry budget is exhausted', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const { registerWithOrchestrator } = await import('../orchestrator');

    await registerWithOrchestrator({
      botType: 'rainbot',
      raincloudUrl: 'http://raincloud.internal:3000',
      workerSecret: 'secret',
      maxAttempts: 1,
      requestTimeoutMs: 50,
    });

    expect(recordWorkerRegistered).toHaveBeenCalledWith('rainbot', false);
    expect(recordWorkerRegistered).toHaveBeenCalledTimes(1);
  });
});
