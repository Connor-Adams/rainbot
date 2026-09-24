import type { NodeSDK } from '@opentelemetry/sdk-node';
import { diag, DiagLogLevel, DiagConsoleLogger } from '@opentelemetry/api';
import { createDeduplicatingDiagLogger } from './diagLogger';

/** Bounded so a hung exporter flush can never keep a redeploy/crash-restart from exiting. */
const SHUTDOWN_TIMEOUT_MS = 5_000;

let sdk: NodeSDK | undefined;

export function isTelemetryStarted(): boolean {
  return sdk !== undefined;
}

/**
 * Railway/container liveness and readiness probes hit `/health/live` and
 * `/health/ready` on a tight interval — every one would otherwise become its
 * own root HTTP span, burying real traffic in Tempo. Exported so it can be
 * unit-tested directly without spinning up NodeSDK's http instrumentation.
 */
export function shouldIgnoreIncomingRequest(request: { url?: string }): boolean {
  return (request.url ?? '').startsWith('/health');
}

/**
 * Must run before anything requires http/redis/pg/express — auto-instrumentation
 * patches modules at require time, so a late start yields spans with none of the
 * surrounding I/O attached.
 *
 * The OpenTelemetry SDK, auto-instrumentations, and exporters are required lazily
 * (inside this function, not at module top level) so that a service which sets
 * OTEL_SDK_DISABLED=true never pays their load cost — importing this package's
 * barrel must be cheap regardless of whether telemetry ends up starting.
 */
export function startTelemetry(serviceName: string): void {
  if (process.env['OTEL_SDK_DISABLED'] === 'true') return;
  if (sdk) return;

  // Exporter failures must be visible but must never reach the app. Deduplicated
  // so a down/slow collector doesn't reprint the same error every export
  // interval forever, burying the operator-facing log stream during exactly
  // the incident where real errors need to stand out; the first occurrence of
  // any distinct message still gets through, so a genuinely new failure is
  // never silently swallowed.
  diag.setLogger(createDeduplicatingDiagLogger(new DiagConsoleLogger()), DiagLogLevel.ERROR);

  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318';

  try {
    const { NodeSDK: NodeSDKCtor } =
      require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } =
      require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPMetricExporter } =
      require('@opentelemetry/exporter-metrics-otlp-http') as typeof import('@opentelemetry/exporter-metrics-otlp-http');
    const { PeriodicExportingMetricReader } =
      require('@opentelemetry/sdk-metrics') as typeof import('@opentelemetry/sdk-metrics');
    const { getNodeAutoInstrumentations } =
      require('@opentelemetry/auto-instrumentations-node') as typeof import('@opentelemetry/auto-instrumentations-node');
    const { resourceFromAttributes } =
      require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } =
      require('@opentelemetry/semantic-conventions') as typeof import('@opentelemetry/semantic-conventions');

    sdk = new NodeSDKCtor({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]:
          process.env['GIT_COMMIT_SHA'] ?? process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'dev',
      }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 30_000,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Noisy and worthless here: every file read in a voice pipeline.
          '@opentelemetry/instrumentation-fs': { enabled: false },
          // The bundle's own runtime-node gauges are enabled by default — do
          // not also register a standalone RuntimeNodeInstrumentation here,
          // or every collection cycle observes each gauge twice.
          //
          // Also pin disableLogSending: this instrumentation is enabled by
          // default and, when @opentelemetry/winston-transport happens to be
          // resolvable, silently injects a second transport into every
          // winston.createLogger — duplicating every log line alongside the
          // hand-written transport in winstonTransport.ts. Today it no-ops
          // only because that package isn't installed; pin it explicitly so
          // a future transitive install can't quietly double the Loki volume.
          '@opentelemetry/instrumentation-winston': { disableLogSending: true },
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: shouldIgnoreIncomingRequest,
          },
        }),
      ],
    });
    sdk.start();
  } catch (error) {
    sdk = undefined;
    console.warn('[observability] telemetry failed to start, continuing without it', error);
  }
}

/**
 * Flushes any in-flight spans/metrics and tears down the SDK. Callers (signal
 * handlers on every service) are expected to exit the process right after —
 * bounded to SHUTDOWN_TIMEOUT_MS so a hung collector connection can never
 * turn a redeploy into a stuck process that has to be force-killed.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  const current = sdk;
  sdk = undefined;
  try {
    await Promise.race([
      current.shutdown(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SHUTDOWN_TIMEOUT_MS).unref();
      }),
    ]);
  } catch {
    // A failed or timed-out flush must not block process exit.
  }
}
