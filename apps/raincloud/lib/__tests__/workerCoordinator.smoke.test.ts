import { VoiceStateManager } from '@lib/voiceStateManager';

jest.mock('axios', () => {
  const create = jest.fn((config: { baseURL: string; headers: Record<string, string> }) => ({
    defaults: { baseURL: config.baseURL, headers: config.headers },
    get: jest.fn().mockResolvedValue({ data: { connected: false } }),
    post: jest.fn().mockResolvedValue({ data: { status: 'success' } }),
  }));

  return {
    __esModule: true,
    default: { create },
    create,
  };
});

function buildCoordinator(): {
  coordinator: import('@lib/workerCoordinator').WorkerCoordinator;
  axiosModule: { create: jest.Mock };
} {
  jest.resetModules();
  const axiosModule = require('axios') as { create: jest.Mock };

  const { WorkerCoordinator } =
    require('@lib/workerCoordinator') as typeof import('@lib/workerCoordinator');
  const coordinatorProto = WorkerCoordinator.prototype as unknown as {
    startHealthPolling: () => void;
  };
  coordinatorProto.startHealthPolling = jest.fn();

  const voiceStateManager = new VoiceStateManager(
    {} as unknown as import('@rainbot/redis-client').RedisClient
  );
  return {
    coordinator: new WorkerCoordinator(voiceStateManager),
    axiosModule,
  };
}

describe('WorkerCoordinator smoke', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('adds worker secret header for internal worker calls', () => {
    process.env.WORKER_SECRET = 'test-secret';
    process.env.RAINBOT_URL = 'rainbot.internal';
    process.env.PRANJEET_URL = 'pranjeet.internal';
    process.env.HUNGERBOT_URL = 'hungerbot.internal';

    const { axiosModule } = buildCoordinator();

    expect(axiosModule.create).toHaveBeenCalled();
    for (const [config] of axiosModule.create.mock.calls) {
      expect(config.headers['x-worker-secret']).toBe('test-secret');
    }
  });

  it('does not append ports for internal railway domains', () => {
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    process.env.RAINBOT_URL = 'rainbot.internal';
    process.env.PRANJEET_URL = 'pranjeet.internal';
    process.env.HUNGERBOT_URL = 'hungerbot.internal';

    const { axiosModule } = buildCoordinator();

    const baseUrls = axiosModule.create.mock.calls.map(([config]) => config.baseURL);
    expect(baseUrls).toContain('http://rainbot.internal');
    expect(baseUrls).toContain('http://pranjeet.internal');
    expect(baseUrls).toContain('http://hungerbot.internal');
    baseUrls.forEach((url) => {
      expect(url).not.toMatch(/:8080/);
    });
  });
});
