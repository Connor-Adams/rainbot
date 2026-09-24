import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { RainbotAttr } from '@rainbot/observability/node';

// getVoiceState backs the queue-length-before/after attributes; mock it so
// tests can control what "the queue" looks like without a real voice
// connection.
jest.mock('../connectionManager', () => ({
  getVoiceState: jest.fn(),
}));

import { getVoiceState } from '../connectionManager';
import { withQueueLock } from '../queueManager';

const mockGetVoiceState = getVoiceState as jest.Mock;

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
  // Without a real context manager, trace.getActiveSpan() inside
  // withQueueLock (used to record queue-length attributes after the lock is
  // acquired) would silently find nothing across the `await` boundaries.
  // Production registers one via `startTelemetry()`.
  context.setGlobalContextManager(new AsyncHooksContextManager().enable());
});

beforeEach(() => {
  mockGetVoiceState.mockReturnValue(undefined);
});

afterEach(() => exporter.reset());

function findSpan(name: string) {
  return exporter.getFinishedSpans().find((s) => s.name === name);
}

describe('withQueueLock telemetry', () => {
  it('emits a queue.mutate span around the locked section', async () => {
    const result = await withQueueLock('guild-1', async () => 'ok');

    expect(result).toBe('ok');
    const span = findSpan('queue.mutate');
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.guildId]).toBe('guild-1');
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('marks the span as an error and still releases the lock when fn throws', async () => {
    const originalError = new Error('mutation failed');

    let caught: unknown;
    try {
      await withQueueLock('guild-2', () => {
        throw originalError;
      });
    } catch (error) {
      caught = error;
    }

    // Identity check: instrumentation must not wrap, replace, or swallow the error.
    expect(caught).toBe(originalError);

    const span = findSpan('queue.mutate');
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.guildId]).toBe('guild-2');
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);

    // Lock must still be released: a second acquisition on the same guild
    // must not hang.
    const result = await withQueueLock('guild-2', async () => 'released');
    expect(result).toBe('released');
  });

  it('records the caller-supplied operation label on the span when provided', async () => {
    await withQueueLock('guild-3', () => 'ok', 'addToQueue');

    const span = findSpan('queue.mutate');
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.queueOperation]).toBe('addToQueue');
  });

  it('omits the operation attribute when the caller does not supply one', async () => {
    await withQueueLock('guild-4', () => 'ok');

    const span = findSpan('queue.mutate');
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.queueOperation]).toBeUndefined();
  });

  it('records queue length before and after the mutation runs', async () => {
    // First read (before fn runs) sees a 2-track queue; second read (after
    // fn runs) sees the 3-track queue post-mutation.
    mockGetVoiceState
      .mockReturnValueOnce({ queue: [{}, {}] })
      .mockReturnValueOnce({ queue: [{}, {}, {}] });

    await withQueueLock('guild-5', () => 'ok');

    const span = findSpan('queue.mutate');
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.queueLength]).toBe(2);
    expect(span!.attributes[RainbotAttr.queueLengthAfter]).toBe(3);
  });

  it('records a queue length of 0 when there is no voice state for the guild', async () => {
    mockGetVoiceState.mockReturnValue(undefined);

    await withQueueLock('guild-6', () => 'ok');

    const span = findSpan('queue.mutate');
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.queueLength]).toBe(0);
    expect(span!.attributes[RainbotAttr.queueLengthAfter]).toBe(0);
  });

  it('emits a queue.lock_wait child span nested under queue.mutate, distinct from it', async () => {
    await withQueueLock('guild-7', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 'ok';
    });

    const parent = findSpan('queue.mutate');
    const lockWait = findSpan('queue.lock_wait');
    expect(parent).toBeDefined();
    expect(lockWait).toBeDefined();
    expect(lockWait!.attributes[RainbotAttr.guildId]).toBe('guild-7');
    // It's a genuine child span of queue.mutate, not a same-named duplicate —
    // this is what lets lock wait time be read apart from work time in a
    // trace view (parent duration minus this child's duration).
    expect(lockWait!.parentSpanContext?.spanId).toBe(parent!.spanContext().spanId);
    expect(lockWait!.spanContext().traceId).toBe(parent!.spanContext().traceId);
  });

  it('lock_wait span duration reflects only the wait, not the wrapped work', async () => {
    // A slow fn() should not inflate the recorded lock-wait duration — that
    // is exactly the F15 gap this instrumentation fixes: lock wait and work
    // time must be separable, not one undifferentiated span.
    await withQueueLock('guild-8', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'ok';
    });

    const parent = findSpan('queue.mutate');
    const lockWait = findSpan('queue.lock_wait');
    expect(parent).toBeDefined();
    expect(lockWait).toBeDefined();

    const parentDurationMs = parent!.duration[0] * 1000 + parent!.duration[1] / 1e6;
    const lockWaitDurationMs = lockWait!.duration[0] * 1000 + lockWait!.duration[1] / 1e6;

    // The wrapped fn() slept ~50ms with an uncontended lock, so lock wait
    // should be a small fraction of the total span duration.
    expect(lockWaitDurationMs).toBeLessThan(parentDurationMs);
    expect(lockWaitDurationMs).toBeLessThan(25);
  });

  it('records a materially non-zero wait for a caller blocked behind a lock holder', async () => {
    // All 8 tests above use an uncontended lock, so `mutex.acquire()` being
    // moved outside the queue.lock_wait span (recording a ~0ms span
    // regardless of real wait time) would pass every one of them. This is
    // the F15 regression guard: a genuinely contended lock must show up as a
    // genuinely non-trivial wait.
    const HOLD_MS = 80;
    let unblockHolder!: () => void;
    const holderGate = new Promise<void>((resolve) => {
      unblockHolder = resolve;
    });

    const holderPromise = withQueueLock('guild-9', async () => {
      await holderGate;
      return 'holder-done';
    });

    // Give the holder a tick to actually acquire the mutex before the second
    // caller starts queuing behind it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const waiterPromise = withQueueLock('guild-9', async () => 'waiter-done');

    setTimeout(unblockHolder, HOLD_MS);

    const [holderResult, waiterResult] = await Promise.all([holderPromise, waiterPromise]);
    expect(holderResult).toBe('holder-done');
    expect(waiterResult).toBe('waiter-done');

    const lockWaitSpans = exporter.getFinishedSpans().filter((s) => s.name === 'queue.lock_wait');
    expect(lockWaitSpans).toHaveLength(2);

    const durations = lockWaitSpans
      .map((s) => s.duration[0] * 1000 + s.duration[1] / 1e6)
      .sort((a, b) => a - b);

    // The holder acquires uncontended (near-zero wait); the second caller is
    // blocked for ~HOLD_MS behind it.
    expect(durations[0]).toBeLessThan(25);
    expect(durations[1]).toBeGreaterThan(HOLD_MS / 2);
  });
});
