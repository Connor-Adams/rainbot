import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { RainbotAttr } from '@rainbot/observability/node';
import { withQueueLock } from '../queueManager';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
});

afterEach(() => exporter.reset());

describe('withQueueLock telemetry', () => {
  it('emits a queue.mutate span around the locked section', async () => {
    const result = await withQueueLock('guild-1', async () => 'ok');

    expect(result).toBe('ok');
    const span = exporter.getFinishedSpans().find((s) => s.name === 'queue.mutate');
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

    const span = exporter.getFinishedSpans().find((s) => s.name === 'queue.mutate');
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.guildId]).toBe('guild-2');
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);

    // Lock must still be released: a second acquisition on the same guild
    // must not hang.
    const result = await withQueueLock('guild-2', async () => 'released');
    expect(result).toBe('released');
  });
});
