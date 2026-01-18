import type { WorkerCoordinator } from './workerCoordinator';

type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';

interface WorkerRegistrationMeta {
  instanceId?: string;
  startedAt?: string;
  version?: string;
}

let coordinator: WorkerCoordinator | null = null;
const pendingRegistrations = new Map<BotType, WorkerRegistrationMeta>();

export function registerWorkerCoordinator(instance: WorkerCoordinator): void {
  coordinator = instance;
  for (const [botType, meta] of pendingRegistrations.entries()) {
    coordinator.markWorkerReady(botType, meta);
  }
  pendingRegistrations.clear();
}

export function recordWorkerRegistration(botType: BotType, meta: WorkerRegistrationMeta): void {
  if (coordinator) {
    coordinator.markWorkerReady(botType, meta);
    return;
  }
  pendingRegistrations.set(botType, meta);
}
