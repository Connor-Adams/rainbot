import type { NodeSDK } from '@opentelemetry/sdk-node';
import { diag, DiagLogLevel, DiagConsoleLogger } from '@opentelemetry/api';

let sdk: NodeSDK | undefined;

export function isTelemetryStarted(): boolean {
  return sdk !== undefined;
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

  // Exporter failures must be visible but must never reach the app.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

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
    const { RuntimeNodeInstrumentation } =
      require('@opentelemetry/instrumentation-runtime-node') as typeof import('@opentelemetry/instrumentation-runtime-node');
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
        }),
        new RuntimeNodeInstrumentation(),
      ],
    });
    sdk.start();
  } catch (error) {
    sdk = undefined;
    console.warn('[observability] telemetry failed to start, continuing without it', error);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch {
    // A failed flush must not block process exit.
  } finally {
    sdk = undefined;
  }
}
