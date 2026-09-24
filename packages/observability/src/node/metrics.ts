import { metrics, type Attributes } from '@opentelemetry/api';
import { RainbotAttr } from '../semconv';

/**
 * Unlike the trace API, the metrics API has no proxy layer: `meter.createXxx()`
 * binds permanently to whatever MeterProvider is globally registered at that
 * exact call. Importing anything from the `@rainbot/observability/node` barrel
 * (even just `startTelemetry`) evaluates this whole module immediately, which
 * is before `startTelemetry()` ever runs as a function call. Creating
 * instruments at module scope would therefore bind them to the no-op provider
 * forever — `setGlobalMeterProvider` called later has no effect on instruments
 * that already exist. Every instrument here is created lazily, on first use,
 * so creation happens inside a record*() call, by which point startTelemetry()
 * has already registered the real provider.
 */
function lazy<T>(create: () => T): () => T {
  let instance: T | undefined;
  return () => {
    if (instance === undefined) {
      instance = create();
    }
    return instance;
  };
}

function getMeter() {
  return metrics.getMeter('@rainbot/observability');
}

const getVoiceConnections = lazy(() =>
  getMeter().createUpDownCounter('rainbot.voice.connections', {
    description: 'Active voice connections',
  })
);

const getTrackResolveDuration = lazy(() =>
  getMeter().createHistogram('rainbot.track.resolve.duration', {
    description: 'Time to resolve a track to a playable stream',
    unit: 'ms',
  })
);

/**
 * The yt-dlp rot signal. yt-dlp breaks against YouTube within weeks of a
 * release, and the weekly image rebuild exists to refresh it. This counter
 * should trend up before playback fails outright.
 */
const getTrackResolveFailures = lazy(() =>
  getMeter().createCounter('rainbot.track.resolve.failures', {
    description: 'Track resolutions that failed, by source and error class',
  })
);

const getRpcDuration = lazy(() =>
  getMeter().createHistogram('rainbot.worker.rpc.duration', {
    description: 'Orchestrator to worker RPC duration',
    unit: 'ms',
  })
);

const registrationState = new Map<string, number>();

/**
 * Workers retry registration four times and then give up permanently, so a
 * stuck 0 here is actionable and will not resolve on its own.
 */
const getWorkerRegisteredGauge = lazy(() => {
  const gauge = getMeter().createObservableGauge('rainbot.worker.registered', {
    description: '1 when the worker is registered with the orchestrator, else 0',
  });
  gauge.addCallback((observer) => {
    for (const [worker, value] of registrationState) {
      observer.observe(value, { [RainbotAttr.worker]: worker });
    }
  });
  return gauge;
});

const getSoundPlayDuration = lazy(() =>
  getMeter().createHistogram('rainbot.sound.play.duration', {
    description: 'Soundboard playback duration, split by phase',
    unit: 'ms',
  })
);

const orchestratorHealthState = new Map<string, number>();

/**
 * Distinct from rainbot.worker.registered (each worker's self-report, set
 * once at boot with no heartbeat) so the two are comparable on a dashboard.
 * This one is raincloud's own belief about a worker — its circuit-breaker
 * state and 15s health poll result — so it stays accurate even when
 * raincloud restarts and loses its in-memory registry while a worker's
 * stale self-report would keep reading 1.
 */
const getWorkerOrchestratorHealthGauge = lazy(() => {
  const gauge = getMeter().createObservableGauge('rainbot.worker.orchestrator_healthy', {
    description:
      "1 when raincloud's own health/circuit-breaker state considers the worker up, else 0",
  });
  gauge.addCallback((observer) => {
    for (const [worker, value] of orchestratorHealthState) {
      observer.observe(value, { [RainbotAttr.worker]: worker });
    }
  });
  return gauge;
});

export function recordVoiceConnections(delta: number, attributes: Attributes): void {
  getVoiceConnections().add(delta, attributes);
}

export function recordTrackResolve(durationMs: number, attributes: Attributes): void {
  getTrackResolveDuration().record(durationMs, attributes);
}

export function recordTrackResolveFailure(attributes: Attributes): void {
  getTrackResolveFailures().add(1, attributes);
}

export function recordRpcDuration(durationMs: number, attributes: Attributes): void {
  getRpcDuration().record(durationMs, attributes);
}

/**
 * Takes the worker name positionally rather than an attributes object: it
 * drives an observable gauge backed by `registrationState`, not a direct
 * counter/histogram recording. Ensures the gauge (and its callback) exist
 * before writing to the map, so the first registration is never dropped.
 */
export function recordWorkerRegistered(worker: string, registered: boolean): void {
  getWorkerRegisteredGauge();
  registrationState.set(worker, registered ? 1 : 0);
}

export function recordSoundPlay(durationMs: number, attributes: Attributes): void {
  getSoundPlayDuration().record(durationMs, attributes);
}

/**
 * Takes the worker name positionally, like recordWorkerRegistered — this
 * drives its own observable gauge backed by orchestratorHealthState.
 */
export function recordWorkerOrchestratorHealth(worker: string, healthy: boolean): void {
  getWorkerOrchestratorHealthGauge();
  orchestratorHealthState.set(worker, healthy ? 1 : 0);
}
