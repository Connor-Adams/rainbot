const mockWarn = jest.fn();
const mockInfo = jest.fn();
const mockErrorLog = jest.fn();

jest.mock('@rainbot/utils/logger', () => ({
  createLogger: () => ({
    warn: mockWarn,
    info: mockInfo,
    debug: jest.fn(),
    error: mockErrorLog,
  }),
}));

const mockRecordWorkerOrchestratorHealth = jest.fn();

jest.mock('@rainbot/observability/node', () => ({
  recordWorkerOrchestratorHealth: (...args: unknown[]) =>
    mockRecordWorkerOrchestratorHealth(...args),
}));

const mockLeaveMutate = jest.fn();

jest.mock('../../src/rpc/clients', () => ({
  fetchWorkerHealthChecks: jest.fn().mockResolvedValue({
    rainbot: { status: 'fulfilled' as const, value: { ok: true, service: 'rainbot' } },
    pranjeet: { status: 'fulfilled' as const, value: { ok: true, service: 'pranjeet' } },
    hungerbot: { status: 'fulfilled' as const, value: { ok: true, service: 'hungerbot' } },
  }),
  workerBaseUrls: {
    rainbot: 'http://localhost:3001',
    pranjeet: 'http://localhost:3002',
    hungerbot: 'http://localhost:3003',
  },
  rainbotClient: {},
  pranjeetClient: {},
  hungerbotClient: {
    leave: { mutate: (...args: unknown[]) => mockLeaveMutate(...args) },
  },
}));

import { WorkerCoordinator } from '@lib/workerCoordinator';
import type { VoiceStateManager } from '@lib/voiceStateManager';

/**
 * F8: raincloud's registry is in-memory, and each worker only self-reports
 * rainbot.worker.registered once at boot with no heartbeat. If raincloud
 * restarts and loses that registry, workers keep reporting 1 forever while
 * raincloud has no way to say otherwise. rainbot.worker.orchestrator_healthy
 * mirrors raincloud's OWN live belief (circuit breaker + health poll)
 * instead, driven from workerCoordinator's recordSuccess/recordFailure.
 * These tests exercise that wiring through the public disconnectWorker path,
 * which round-trips through requestWithRetry -> recordSuccess/recordFailure.
 */
function buildCoordinator(): WorkerCoordinator {
  const coordinatorProto = WorkerCoordinator.prototype as unknown as {
    startHealthPolling: () => void;
  };
  coordinatorProto.startHealthPolling = jest.fn();

  const voiceStateManager = {
    setWorkerStatus: jest.fn().mockResolvedValue(undefined),
  } as unknown as VoiceStateManager;
  return new WorkerCoordinator(voiceStateManager);
}

describe('WorkerCoordinator orchestrator-health metric', () => {
  beforeEach(() => {
    mockRecordWorkerOrchestratorHealth.mockClear();
    mockLeaveMutate.mockReset();
    mockWarn.mockClear();
    mockInfo.mockClear();
    mockErrorLog.mockClear();
  });

  it('constructs with every worker reported healthy up front', () => {
    buildCoordinator();

    expect(mockRecordWorkerOrchestratorHealth).toHaveBeenCalledWith('rainbot', true);
    expect(mockRecordWorkerOrchestratorHealth).toHaveBeenCalledWith('pranjeet', true);
    expect(mockRecordWorkerOrchestratorHealth).toHaveBeenCalledWith('hungerbot', true);
  });

  it('reports healthy=true after a successful worker RPC', async () => {
    mockLeaveMutate.mockResolvedValue({ status: 'left' });
    const coordinator = buildCoordinator();
    mockRecordWorkerOrchestratorHealth.mockClear();

    await coordinator.disconnectWorker('hungerbot', 'guild-1');

    expect(mockRecordWorkerOrchestratorHealth).toHaveBeenCalledWith('hungerbot', true);
  });

  it('reports healthy=false once repeated RPC failures open the circuit breaker', async () => {
    mockLeaveMutate.mockRejectedValue(new Error('worker unreachable'));
    const coordinator = buildCoordinator();
    mockRecordWorkerOrchestratorHealth.mockClear();

    await coordinator.disconnectWorker('hungerbot', 'guild-1');

    // requestWithRetry makes RETRY_MAX + 1 = 3 attempts for an idempotent
    // call; each failed attempt calls recordFailure, which re-derives and
    // records the gauge. The 3rd failure crosses CIRCUIT_FAILURE_THRESHOLD
    // and opens the circuit, so the LAST recorded value must be false.
    const hungerbotCalls = mockRecordWorkerOrchestratorHealth.mock.calls.filter(
      (call) => call[0] === 'hungerbot'
    );
    expect(hungerbotCalls.length).toBeGreaterThanOrEqual(3);
    expect(hungerbotCalls[hungerbotCalls.length - 1][1]).toBe(false);
  }, 10_000);
});
