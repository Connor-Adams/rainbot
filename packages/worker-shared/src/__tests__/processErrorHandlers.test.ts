import { setupProcessErrorHandlers } from '../errors/process';
import { isTelemetryStarted, shutdownTelemetry } from '@rainbot/observability/node';

jest.mock('@rainbot/observability/node', () => ({
  isTelemetryStarted: jest.fn(),
  shutdownTelemetry: jest.fn(),
}));

function fakeLogger() {
  return {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  } as never;
}

describe('setupProcessErrorHandlers', () => {
  const originalExit = process.exit;
  let exit: jest.Mock;

  beforeEach(() => {
    exit = jest.fn();
    process.exit = exit as never;
    jest.mocked(isTelemetryStarted).mockReturnValue(false);
    jest.mocked(shutdownTelemetry).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.exit = originalExit;
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('exits after an uncaught exception instead of leaving a half-dead process', () => {
    jest.useFakeTimers();
    const logger = fakeLogger();
    setupProcessErrorHandlers(logger);

    const listener = process.listeners('uncaughtException').at(-1) as (error: Error) => void;
    listener(new Error('spawn ffmpeg EAGAIN'));

    jest.runOnlyPendingTimers();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('keeps running after an unhandled rejection', () => {
    const logger = fakeLogger();
    setupProcessErrorHandlers(logger);

    const listener = process.listeners('unhandledRejection').at(-1) as (reason: unknown) => void;
    listener(new Error('some background promise failed'));

    expect(exit).not.toHaveBeenCalled();
  });

  it('does not register SIGTERM/SIGINT handlers when telemetry never started', () => {
    jest.mocked(isTelemetryStarted).mockReturnValue(false);
    setupProcessErrorHandlers(fakeLogger());

    // Mutation check: if the isTelemetryStarted() guard were removed, this
    // would be 1, not 0 — this assertion fails without the guard.
    expect(process.listeners('SIGTERM')).toHaveLength(0);
    expect(process.listeners('SIGINT')).toHaveLength(0);
  });

  it('flushes telemetry and exits on SIGTERM when telemetry started', async () => {
    jest.mocked(isTelemetryStarted).mockReturnValue(true);
    setupProcessErrorHandlers(fakeLogger());

    const listener = process.listeners('SIGTERM').at(-1) as () => void;
    listener();
    // Let the shutdownTelemetry().finally(...) microtask run.
    await Promise.resolve();
    await Promise.resolve();

    expect(shutdownTelemetry).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('flushes telemetry and exits on SIGINT when telemetry started', async () => {
    jest.mocked(isTelemetryStarted).mockReturnValue(true);
    setupProcessErrorHandlers(fakeLogger());

    const listener = process.listeners('SIGINT').at(-1) as () => void;
    listener();
    await Promise.resolve();
    await Promise.resolve();

    expect(shutdownTelemetry).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('still exits on SIGTERM even if flushing telemetry rejects', async () => {
    jest.mocked(isTelemetryStarted).mockReturnValue(true);
    jest.mocked(shutdownTelemetry).mockRejectedValue(new Error('flush failed'));
    setupProcessErrorHandlers(fakeLogger());

    const listener = process.listeners('SIGTERM').at(-1) as () => void;
    listener();
    await Promise.resolve();
    await Promise.resolve();

    expect(exit).toHaveBeenCalledWith(0);
  });
});
