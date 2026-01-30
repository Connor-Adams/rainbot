import { VoiceStateManager } from '@lib/voiceStateManager';
import { WorkerCoordinator } from '@lib/workerCoordinator';

jest.mock('../../src/rpc/clients', () => ({
  fetchWorkerHealthChecks: jest.fn().mockResolvedValue({
    rainbot: { status: 'fulfilled' as const, value: { ok: true, service: 'rainbot' } },
    pranjeet: { status: 'fulfilled' as const, value: { ok: true, service: 'pranjeet' } },
    hungerbot: { status: 'fulfilled' as const, value: { ok: true, service: 'hungerbot' } },
  }),
  rainbotClient: {},
  pranjeetClient: {},
  hungerbotClient: {},
}));

function buildCoordinator(): import('@lib/workerCoordinator').WorkerCoordinator {
  const coordinatorProto = WorkerCoordinator.prototype as unknown as {
    startHealthPolling: () => void;
  };
  coordinatorProto.startHealthPolling = jest.fn();

  const voiceStateManager = new VoiceStateManager(
    {} as unknown as import('@rainbot/redis-client').RedisClient
  );
  return new WorkerCoordinator(voiceStateManager);
}

describe('WorkerCoordinator smoke', () => {
  it('constructs and initializes circuit and health for all bot types', () => {
    const coordinator = buildCoordinator();
    const circuit = (coordinator as unknown as { circuit: Map<string, unknown> }).circuit;
    const health = (coordinator as unknown as { health: Map<string, unknown> }).health;
    const botTypes = ['rainbot', 'pranjeet', 'hungerbot'];
    for (const botType of botTypes) {
      expect(circuit.has(botType)).toBe(true);
      expect(health.has(botType)).toBe(true);
    }
  });
});
