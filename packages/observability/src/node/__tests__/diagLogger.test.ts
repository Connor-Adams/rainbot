import type { DiagLogger } from '@opentelemetry/api';
import { createDeduplicatingDiagLogger } from '../diagLogger';

function createSpyLogger(): DiagLogger & { calls: [string, string, unknown[]][] } {
  const calls: [string, string, unknown[]][] = [];
  const record =
    (level: string) =>
    (message: string, ...args: unknown[]) => {
      calls.push([level, message, args]);
    };
  return {
    calls,
    error: record('error'),
    warn: record('warn'),
    info: record('info'),
    debug: record('debug'),
    verbose: record('verbose'),
  };
}

describe('createDeduplicatingDiagLogger', () => {
  it('forwards the first occurrence of a message', () => {
    const delegate = createSpyLogger();
    const logger = createDeduplicatingDiagLogger(delegate);

    logger.error('collector unreachable', { code: 'ECONNREFUSED' });

    expect(delegate.calls).toEqual([
      ['error', 'collector unreachable', [{ code: 'ECONNREFUSED' }]],
    ]);
  });

  it('suppresses exact repeats of the same message at the same level', () => {
    const delegate = createSpyLogger();
    const logger = createDeduplicatingDiagLogger(delegate);

    logger.error('collector unreachable');
    logger.error('collector unreachable');
    logger.error('collector unreachable');

    // Mutation check: if the dedup guard were removed (always forwarding),
    // this would be 3, not 1 — this assertion fails without the suppression.
    expect(delegate.calls).toHaveLength(1);
  });

  it('still lets a genuinely new message through after a repeat is suppressed', () => {
    const delegate = createSpyLogger();
    const logger = createDeduplicatingDiagLogger(delegate);

    logger.error('collector unreachable');
    logger.error('collector unreachable');
    logger.error('endpoint misconfigured');

    expect(delegate.calls.map(([, message]) => message)).toEqual([
      'collector unreachable',
      'endpoint misconfigured',
    ]);
  });

  it('treats the same message at different levels as distinct', () => {
    const delegate = createSpyLogger();
    const logger = createDeduplicatingDiagLogger(delegate);

    logger.warn('retrying export');
    logger.error('retrying export');

    expect(delegate.calls).toHaveLength(2);
  });

  describe('dedup window re-arm', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('forwards a repeat again once the dedup window resets', () => {
      jest.useFakeTimers();
      const delegate = createSpyLogger();
      const REARM_MS = 1000;
      const logger = createDeduplicatingDiagLogger(delegate, REARM_MS);

      logger.error('collector unreachable');
      logger.error('collector unreachable');
      expect(delegate.calls).toHaveLength(1);

      // A second, later incident sharing the same message must not stay
      // silent for the rest of the process's life — that's exactly the gap
      // this re-arm closes.
      jest.advanceTimersByTime(REARM_MS);
      logger.error('collector unreachable');

      expect(
        delegate.calls.filter(([, message]) => message === 'collector unreachable')
      ).toHaveLength(2);
    });

    it('logs a suppressed-repeat summary at reset only when something was suppressed', () => {
      jest.useFakeTimers();
      const delegate = createSpyLogger();
      const REARM_MS = 1000;
      const logger = createDeduplicatingDiagLogger(delegate, REARM_MS);

      logger.error('collector unreachable');
      logger.error('collector unreachable');
      logger.error('collector unreachable');

      jest.advanceTimersByTime(REARM_MS);

      const summaries = delegate.calls.filter(([, message]) =>
        message.includes('dedup window reset')
      );
      expect(summaries).toHaveLength(1);
      expect(summaries[0]![1]).toContain('2');
    });

    it('does not log a summary at reset when nothing was suppressed', () => {
      jest.useFakeTimers();
      const delegate = createSpyLogger();
      const REARM_MS = 1000;
      const logger = createDeduplicatingDiagLogger(delegate, REARM_MS);

      logger.error('collector unreachable');
      jest.advanceTimersByTime(REARM_MS);

      const summaries = delegate.calls.filter(([, message]) =>
        message.includes('dedup window reset')
      );
      expect(summaries).toHaveLength(0);
    });
  });
});
