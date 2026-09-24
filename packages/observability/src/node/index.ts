export { startTelemetry, shutdownTelemetry, isTelemetryStarted } from './sdk';
export { withSpan } from './spans';
export {
  recordVoiceConnections,
  recordTrackResolve,
  recordTrackResolveFailure,
  recordRpcDuration,
  recordWorkerRegistered,
  recordSoundPlay,
  recordWorkerOrchestratorHealth,
} from './metrics';
export { RainbotAttr } from '../semconv';
export { createOtlpTransport } from './winstonTransport';
