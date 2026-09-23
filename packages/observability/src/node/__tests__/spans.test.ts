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
    await expect(
      withSpan('track.resolve', {}, async () => {
        throw new Error('yt-dlp exited 1');
      })
    ).rejects.toThrow('yt-dlp exited 1');

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((e) => e.name)).toContain('exception');
  });
});
