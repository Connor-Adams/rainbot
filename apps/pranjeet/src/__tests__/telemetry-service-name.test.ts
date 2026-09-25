/**
 * The service name is not cosmetic: the telemetry stack's Prometheus scrape
 * runs honor_labels: true, so this string becomes the `job` label, the Loki
 * `service_name` label, and Tempo's service.name. Every provisioned rainbot
 * dashboard query matches on `rainbot-*`, so a rename here silently empties
 * those panels. Hence a test on the literal.
 */
jest.mock('@rainbot/observability/node', () => ({
  startTelemetry: jest.fn(),
}));

describe('worker telemetry bootstrap', () => {
  it('starts telemetry under the tenant-qualified service name', () => {
    require('../telemetry');

    const { startTelemetry } = require('@rainbot/observability/node');
    expect(startTelemetry).toHaveBeenCalledWith('rainbot-pranjeet');
  });
});
