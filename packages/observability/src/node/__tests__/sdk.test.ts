import { startTelemetry, shutdownTelemetry, isTelemetryStarted } from '../sdk';

describe('startTelemetry', () => {
  afterEach(async () => {
    await shutdownTelemetry();
    delete process.env['OTEL_SDK_DISABLED'];
  });

  it('does nothing when OTEL_SDK_DISABLED is true', () => {
    process.env['OTEL_SDK_DISABLED'] = 'true';
    startTelemetry('test-service');
    expect(isTelemetryStarted()).toBe(false);
  });

  it('starts once and is idempotent', () => {
    startTelemetry('test-service');
    startTelemetry('test-service');
    expect(isTelemetryStarted()).toBe(true);
  });

  it('never throws when the collector endpoint is unreachable', () => {
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://127.0.0.1:1';
    expect(() => startTelemetry('test-service')).not.toThrow();
  });
});
