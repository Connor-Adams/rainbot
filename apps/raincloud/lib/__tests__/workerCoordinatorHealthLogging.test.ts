const mockWarn = jest.fn();
const mockInfo = jest.fn();
const mockFetchWorkerHealthChecks = jest.fn();

jest.mock('@rainbot/utils/logger', () => ({
  createLogger: () => ({
    warn: mockWarn,
    info: mockInfo,
    debug: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../../src/rpc/clients', () => ({
  fetchWorkerHealthChecks: () => mockFetchWorkerHealthChecks(),
  workerBaseUrls: {
    rainbot: 'http://localhost:3001',
    pranjeet: 'http://localhost:3002',
    hungerbot: 'http://localhost:3003',
  },
  rainbotClient: {},
  pranjeetClient: {},
  hungerbotClient: {},
}));

import { VoiceStateManager } from '@lib/voiceStateManager';
import { WorkerCoordinator } from '@lib/workerCoordinator';

const HEALTH_POLL_MS = 15_000;

function healthChecks(pranjeetReady: boolean) {
  const ok = (service: string) => ({
    status: 'fulfilled' as const,
    value: { ok: true, service },
  });
  return {
    rainbot: ok('rainbot'),
    hungerbot: ok('hungerbot'),
    pranjeet: pranjeetReady
      ? ok('pranjeet')
      : { status: 'rejected' as const, reason: new Error('fetch failed') },
  };
}

function buildCoordinator(): WorkerCoordinator {
  const voiceStateManager = new VoiceStateManager(
    {} as unknown as import('@rainbot/redis-client').RedisClient
  );
  return new WorkerCoordinator(voiceStateManager);
}

function pranjeetWarnings(): string[] {
  return mockWarn.mock.calls
    .map((call) => String(call[0]))
    .filter((msg) => msg.includes('pranjeet'));
}

describe('WorkerCoordinator health polling logs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWarn.mockClear();
    mockInfo.mockClear();
    mockFetchWorkerHealthChecks.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('warns once for a worker that stays down instead of on every poll', async () => {
    mockFetchWorkerHealthChecks.mockResolvedValue(healthChecks(false));
    buildCoordinator();

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(HEALTH_POLL_MS * 4);

    expect(pranjeetWarnings()).toHaveLength(1);
  });

  it('logs recovery and warns again if the worker drops a second time', async () => {
    mockFetchWorkerHealthChecks.mockResolvedValue(healthChecks(false));
    buildCoordinator();

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(HEALTH_POLL_MS);

    mockFetchWorkerHealthChecks.mockResolvedValue(healthChecks(true));
    await jest.advanceTimersByTimeAsync(HEALTH_POLL_MS);

    expect(
      mockInfo.mock.calls
        .map((call) => String(call[0]))
        .filter((msg) => msg.includes('pranjeet health check recovered'))
    ).toHaveLength(1);

    mockFetchWorkerHealthChecks.mockResolvedValue(healthChecks(false));
    await jest.advanceTimersByTimeAsync(HEALTH_POLL_MS);

    expect(pranjeetWarnings()).toHaveLength(2);
  });
});
