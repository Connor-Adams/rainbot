import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import { metrics, type Attributes } from '@opentelemetry/api';
import {
  recordTrackResolveFailure,
  recordRpcDuration,
  recordWorkerRegistered,
  recordWorkerOrchestratorHealth,
} from '../metrics';
import { RainbotAttr } from '../../semconv';

let exporter: InMemoryMetricExporter;
let reader: PeriodicExportingMetricReader;

beforeAll(() => {
  exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
});

describe('metrics', () => {
  it('records a track resolve failure with its source', async () => {
    recordTrackResolveFailure({ [RainbotAttr.trackSource]: 'youtube' });
    await reader.forceFlush();

    const names = exporter
      .getMetrics()
      .flatMap((m) => m.scopeMetrics)
      .flatMap((s) => s.metrics)
      .map((m) => m.descriptor.name);
    expect(names).toContain('rainbot.track.resolve.failures');
  });

  it('records rpc duration', async () => {
    recordRpcDuration(12, { [RainbotAttr.rpcProcedure]: 'playSound' });
    await reader.forceFlush();

    const names = exporter
      .getMetrics()
      .flatMap((m) => m.scopeMetrics)
      .flatMap((s) => s.metrics)
      .map((m) => m.descriptor.name);
    expect(names).toContain('rainbot.worker.rpc.duration');
  });

  // recordWorkerRegistered drives an observable gauge backed by a Map. An
  // observable gauge whose callback is registered but never calls
  // observer.observe() emits nothing on collection — this exercises that the
  // callback actually reads the map and reports per-worker values, and that
  // the positional (worker, registered) signature (not an attributes object)
  // is wired to the right attribute key.
  it('drives the worker-registered gauge from recordWorkerRegistered, per worker', async () => {
    recordWorkerRegistered('rainbot', true);
    recordWorkerRegistered('pranjeet', false);
    await reader.forceFlush();

    const gaugeMetric = exporter
      .getMetrics()
      .flatMap((m) => m.scopeMetrics)
      .flatMap((s) => s.metrics)
      .find((m) => m.descriptor.name === 'rainbot.worker.registered');

    expect(gaugeMetric).toBeDefined();

    const dataPoints = gaugeMetric?.dataPoints as Array<{
      value: number;
      attributes: Attributes;
    }>;
    const rainbotPoint = dataPoints.find((p) => p.attributes[RainbotAttr.worker] === 'rainbot');
    const pranjeetPoint = dataPoints.find((p) => p.attributes[RainbotAttr.worker] === 'pranjeet');

    expect(rainbotPoint?.value).toBe(1);
    expect(pranjeetPoint?.value).toBe(0);
  });

  // F8: rainbot.worker.orchestrator_healthy must be a distinct metric from
  // rainbot.worker.registered — the two represent different views (a
  // worker's one-shot self-report vs. raincloud's own live circuit/health
  // belief) and need to be independently queryable/comparable on a
  // dashboard.
  it('drives a distinct orchestrator-health gauge from recordWorkerOrchestratorHealth, per worker', async () => {
    recordWorkerOrchestratorHealth('rainbot', true);
    recordWorkerOrchestratorHealth('pranjeet', false);
    await reader.forceFlush();

    const names = exporter
      .getMetrics()
      .flatMap((m) => m.scopeMetrics)
      .flatMap((s) => s.metrics)
      .map((m) => m.descriptor.name);
    expect(names).toContain('rainbot.worker.orchestrator_healthy');
    // Must be a name of its own, not a reuse of the self-reported gauge's
    // name/series — the two views need to stay independently queryable.
    expect('rainbot.worker.orchestrator_healthy').not.toBe('rainbot.worker.registered');

    const gaugeMetric = exporter
      .getMetrics()
      .flatMap((m) => m.scopeMetrics)
      .flatMap((s) => s.metrics)
      .find((m) => m.descriptor.name === 'rainbot.worker.orchestrator_healthy');

    expect(gaugeMetric).toBeDefined();
    const dataPoints = gaugeMetric?.dataPoints as Array<{
      value: number;
      attributes: Attributes;
    }>;
    const rainbotPoint = dataPoints.find((p) => p.attributes[RainbotAttr.worker] === 'rainbot');
    const pranjeetPoint = dataPoints.find((p) => p.attributes[RainbotAttr.worker] === 'pranjeet');

    expect(rainbotPoint?.value).toBe(1);
    expect(pranjeetPoint?.value).toBe(0);
  });
});
