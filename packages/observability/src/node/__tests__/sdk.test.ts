import {
  startTelemetry,
  shutdownTelemetry,
  isTelemetryStarted,
  shouldIgnoreIncomingRequest,
} from '../sdk';

// F11: Railway/container health probes hit /health/live and /health/ready on
// a tight interval; without this, every one becomes its own root HTTP span
// in Tempo, on top of the health-check RPC spans (see packages/rpc's
// client.ts/trpc.ts exclusions).
describe('shouldIgnoreIncomingRequest', () => {
  it('ignores /health/live and /health/ready', () => {
    expect(shouldIgnoreIncomingRequest({ url: '/health/live' })).toBe(true);
    expect(shouldIgnoreIncomingRequest({ url: '/health/ready' })).toBe(true);
  });

  it('does not ignore real traffic, including paths that merely start similarly', () => {
    expect(shouldIgnoreIncomingRequest({ url: '/trpc' })).toBe(false);
    expect(shouldIgnoreIncomingRequest({ url: '/api/health-check' })).toBe(false);
    expect(shouldIgnoreIncomingRequest({ url: undefined })).toBe(false);
  });
});

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

  it('never crashes the process when NodeSDK.start() throws', () => {
    // These are long-running Discord gateway clients — an exception escaping
    // startTelemetry kills the process. Force the failure mode that matters:
    // NodeSDK itself throwing synchronously on start(), not an unreachable
    // endpoint (which never triggers synchronous I/O and proves nothing).
    jest.resetModules();
    jest.doMock('@opentelemetry/sdk-node', () => ({
      NodeSDK: jest.fn().mockImplementation(() => ({
        start: () => {
          throw new Error('boom');
        },
      })),
    }));

    const isolated: typeof import('../sdk') = require('../sdk');

    expect(() => isolated.startTelemetry('test-service')).not.toThrow();
    expect(isolated.isTelemetryStarted()).toBe(false);

    jest.dontMock('@opentelemetry/sdk-node');
    jest.resetModules();
  });
});

describe('shutdownTelemetry', () => {
  afterEach(async () => {
    await shutdownTelemetry();
    delete process.env['OTEL_SDK_DISABLED'];
    jest.dontMock('@opentelemetry/sdk-node');
    jest.resetModules();
  });

  it('resolves even when the underlying SDK shutdown hangs forever', async () => {
    // A collector that never responds must not turn a redeploy into a stuck
    // process — shutdownTelemetry has to give up and resolve on its own.
    jest.resetModules();
    jest.doMock('@opentelemetry/sdk-node', () => ({
      NodeSDK: jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        shutdown: () => new Promise(() => {}), // never resolves
      })),
    }));

    const isolated: typeof import('../sdk') = require('../sdk');
    isolated.startTelemetry('test-service');
    expect(isolated.isTelemetryStarted()).toBe(true);

    await isolated.shutdownTelemetry();

    expect(isolated.isTelemetryStarted()).toBe(false);
  }, 10_000);
});
