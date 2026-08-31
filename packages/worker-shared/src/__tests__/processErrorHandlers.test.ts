import { setupProcessErrorHandlers } from '../errors/process';

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
  });

  afterEach(() => {
    process.exit = originalExit;
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    jest.useRealTimers();
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
});
