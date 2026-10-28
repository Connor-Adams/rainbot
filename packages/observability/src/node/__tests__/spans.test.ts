import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { withSpan } from '../spans';
import { RainbotAttr } from '../../semconv';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  // Without a context manager no span is ever active, so nesting is untestable.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
});

afterEach(() => exporter.reset());

describe('withSpan', () => {
  it('records the result and the attributes', async () => {
    const result = await withSpan(
      'track.resolve',
      { [RainbotAttr.guildId]: '123' },
      async () => 42
    );

    expect(result).toBe(42);
    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('track.resolve');
    expect(span.attributes[RainbotAttr.guildId]).toBe('123');
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('records the exception, marks the span as error, and rethrows', async () => {
    class YtDlpError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'YtDlpError';
      }
    }

    const originalError = new YtDlpError('yt-dlp exited 1');

    let caughtError: unknown;
    try {
      await withSpan('track.resolve', {}, async () => {
        throw originalError;
      });
      fail('Expected withSpan to throw');
    } catch (error) {
      caughtError = error;
    }

    // Enforce error identity: must be the same instance, not a wrapper
    expect(caughtError).toBe(originalError);
    expect(caughtError).toBeInstanceOf(YtDlpError);
    expect((caughtError as Error).name).toBe('YtDlpError');

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((e) => e.name)).toContain('exception');
  });

  it('joins the active trace by default', async () => {
    await withSpan('outer', {}, () => withSpan('inner', {}, async () => undefined));

    const [inner, outer] = exporter.getFinishedSpans();
    expect(inner.spanContext().traceId).toBe(outer.spanContext().traceId);
    expect(inner.parentSpanContext?.spanId).toBe(outer.spanContext().spanId);
  });

  it('starts a new trace when root is set', async () => {
    await withSpan('outer', {}, () =>
      withSpan('track.play', {}, async () => undefined, { root: true })
    );

    const [inner, outer] = exporter.getFinishedSpans();
    expect(inner.spanContext().traceId).not.toBe(outer.spanContext().traceId);
    expect(inner.parentSpanContext).toBeUndefined();
  });
});
