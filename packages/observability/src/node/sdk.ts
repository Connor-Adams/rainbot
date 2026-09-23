import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagLogLevel, DiagConsoleLogger } from '@opentelemetry/api';

let sdk: NodeSDK | undefined;

export function isTelemetryStarted(): boolean {
  return sdk !== undefined;
}

/**
 * Must run before anything requires http/redis/pg/express — auto-instrumentation
 * patches modules at require time, so a late start yields spans with none of the
 * surrounding I/O attached.
 */
export function startTelemetry(serviceName: string): void {
  if (process.env['OTEL_SDK_DISABLED'] === 'true') return;
  if (sdk) return;

  // Exporter failures must be visible but must never reach the app.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318';

  try {
    sdk = new NodeSDK({
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
