import { VoiceStateManager } from '@lib/voiceStateManager';
import { WorkerCoordinator } from '@lib/workerCoordinator';

const mockRainbotGetState = jest.fn();
const mockRainbotVolume = jest.fn();

jest.mock('../../src/rpc/clients', () => ({
  fetchWorkerHealthChecks: jest.fn(),
  workerBaseUrls: {
    rainbot: 'http://localhost:3001',
    pranjeet: 'http://localhost:3002',
    hungerbot: 'http://localhost:3003',
  },
  rainbotClient: {
    getState: { query: (...args: unknown[]) => mockRainbotGetState(...args) },
    volume: { mutate: (...args: unknown[]) => mockRainbotVolume(...args) },
  },
  pranjeetClient: {},
  hungerbotClient: {},
}));

const GUILD = 'guild-1';
const CHANNEL = 'channel-1';

function buildCoordinator(stored: Record<string, string>): WorkerCoordinator {
  (
    WorkerCoordinator.prototype as unknown as { startHealthPolling: () => void }
  ).startHealthPolling = jest.fn();
  const redis = {
    get: jest.fn(async (key: string) => stored[key] ?? null),
    set: jest.fn(async (key: string, value: string) => {
      stored[key] = value;
    }),
  };
  const voiceStateManager = new VoiceStateManager(
    redis as unknown as import('@rainbot/redis-client').RedisClient
  );
  jest.spyOn(voiceStateManager, 'setWorkerStatus').mockResolvedValue(undefined);
  return new WorkerCoordinator(voiceStateManager);
}

beforeEach(() => {
  mockRainbotGetState.mockReset();
  mockRainbotVolume.mockReset().mockResolvedValue({ status: 'success', volume: 0 });
});

describe('WorkerCoordinator.ensureWorkerConnected volume restore', () => {
  it('pushes the saved volume to a worker that came back at its default', async () => {
    mockRainbotGetState.mockResolvedValue({ connected: true, channelId: CHANNEL, volume: 1 });
    const coordinator = buildCoordinator({ [`volume:${GUILD}:rainbot`]: '0.59' });

    await expect(coordinator.ensureWorkerConnected('rainbot', GUILD, CHANNEL)).resolves.toEqual({
      success: true,
    });

    expect(mockRainbotVolume).toHaveBeenCalledTimes(1);
    expect(mockRainbotVolume.mock.calls[0][0]).toMatchObject({ guildId: GUILD, volume: 0.59 });
  });

  it('does nothing when the worker already reports the saved volume', async () => {
    mockRainbotGetState.mockResolvedValue({ connected: true, channelId: CHANNEL, volume: 0.59 });
    const coordinator = buildCoordinator({ [`volume:${GUILD}:rainbot`]: '0.59' });

    await coordinator.ensureWorkerConnected('rainbot', GUILD, CHANNEL);

    expect(mockRainbotVolume).not.toHaveBeenCalled();
  });

  it('leaves the worker default alone when no volume was ever set', async () => {
    mockRainbotGetState.mockResolvedValue({ connected: true, channelId: CHANNEL, volume: 1 });
    const coordinator = buildCoordinator({});

    await coordinator.ensureWorkerConnected('rainbot', GUILD, CHANNEL);

    expect(mockRainbotVolume).not.toHaveBeenCalled();
  });

  it('still reports the connect as successful when the restore fails', async () => {
    mockRainbotGetState.mockResolvedValue({ connected: true, channelId: CHANNEL, volume: 1 });
    mockRainbotVolume.mockResolvedValue({ status: 'error', message: 'boom' });
    const coordinator = buildCoordinator({ [`volume:${GUILD}:rainbot`]: '0.59' });

    await expect(coordinator.ensureWorkerConnected('rainbot', GUILD, CHANNEL)).resolves.toEqual({
      success: true,
    });
  });
});
