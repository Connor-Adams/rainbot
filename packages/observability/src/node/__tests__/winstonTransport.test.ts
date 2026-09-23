import { createOtlpTransport, type LogRecord } from '../winstonTransport';

describe('createOtlpTransport', () => {
  let emitted: LogRecord[];
  const emit = (record: LogRecord): void => {
    emitted.push(record);
  };

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
});
