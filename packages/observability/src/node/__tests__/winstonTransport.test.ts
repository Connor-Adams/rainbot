import { trace, context } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { createOtlpTransport, type LogRecord } from '../winstonTransport';

describe('createOtlpTransport', () => {
  let emitted: LogRecord[];
  const emit = (record: LogRecord): void => {
    emitted.push(record);
  };

  beforeAll(() => {
    // The API's default context manager is a no-op that ignores whatever
    // context you hand `context.with()`, so a span "activated" without a
    // real context manager registered would never actually show up on
    // `context.active()`. Register the real Node one so this suite's
    // active-span test exercises the same propagation production does.
    context.setGlobalContextManager(new AsyncHooksContextManager().enable());
  });

  beforeEach(() => {
    emitted = [];
  });

  afterEach(() => {
    delete process.env['OTEL_SDK_DISABLED'];
  });

  it('returns undefined when telemetry is disabled', () => {
    process.env['OTEL_SDK_DISABLED'] = 'true';
    expect(createOtlpTransport(emit)).toBeUndefined();
  });

  it('omits trace context cleanly when no span is active', () => {
    const transport = createOtlpTransport(emit);
    transport!.log!({ level: 'info', message: 'hello' }, () => undefined);

    expect(emitted[0].attributes['trace_id']).toBeUndefined();
    expect(emitted[0].body).toBe('hello');
  });

  it('never throws when the emitter throws', () => {
    const transport = createOtlpTransport(() => {
      throw new Error('collector unreachable');
    });

    expect(() => transport!.log!({ level: 'info', message: 'x' }, () => undefined)).not.toThrow();
  });

  it('still calls next() when the emitter throws, so Winston is not wedged', () => {
    const transport = createOtlpTransport(() => {
      throw new Error('collector unreachable');
    });
    const next = jest.fn();

    transport!.log!({ level: 'info', message: 'x' }, next);
    expect(next).toHaveBeenCalled();
  });

  it('correlates to the active span with the OTel-standard attribute keys', () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const tracer = provider.getTracer('winstonTransport.test');
    const span = tracer.startSpan('test-span');

    const transport = createOtlpTransport(emit);
    context.with(trace.setSpan(context.active(), span), () => {
      transport!.log!({ level: 'info', message: 'hello' }, () => undefined);
    });
    span.end();

    const spanContext = span.spanContext();
    expect(emitted[0].attributes['trace_id']).toBe(spanContext.traceId);
    expect(emitted[0].attributes['span_id']).toBe(spanContext.spanId);
  });
});
