import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { withSpan } from '../spans';
import { RainbotAttr } from '../../semconv';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
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
});
