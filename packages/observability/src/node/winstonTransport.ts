import Transport from 'winston-transport';
import { trace, context } from '@opentelemetry/api';
import { logs, SeverityNumber, type AnyValue } from '@opentelemetry/api-logs';

export interface LogRecord {
  body: string;
  severityNumber: SeverityNumber;
  severityText: string;
  attributes: Record<string, AnyValue>;
}

/**
 * The emitter is injected so tests exercise the real transport path with a
 * fake sink, rather than the transport branching on NODE_ENV and tests
 * asserting on a branch that only exists for them.
 */
export type Emit = (record: LogRecord) => void;

/**
 * Unlike `metrics.getMeter()` (see metrics.ts), `logs.getLogger()` does not
 * bind permanently to whatever LoggerProvider is registered at call time.
 * The logs API's ProxyLoggerProvider/ProxyLogger mirror the trace API's
 * ProxyTracer: `getLogger()` returns a `ProxyLogger` when no real provider is
 * registered yet, and that proxy resolves its delegate lazily the first time
 * `emit()`/`enabled()` is actually called on it, not at `getLogger()` time.
 * Calling `logs.getLogger()` fresh inside this function (rather than caching
 * it at module scope) is what keeps this safe either way.
 */
const defaultEmit: Emit = (record) => {
  logs.getLogger('@rainbot/observability').emit(record);
};

const SEVERITY: Record<string, SeverityNumber> = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  info: SeverityNumber.INFO,
  http: SeverityNumber.DEBUG,
  debug: SeverityNumber.DEBUG,
};

class OtlpTransport extends Transport {
  // Named emitLog, not emit: Transport (via Node's EventEmitter) already
  // owns a public `emit(eventName, ...args)` method, and a same-named
  // private property here would shadow it.
  constructor(private readonly emitLog: Emit) {
    super();
  }

  override log(info: Record<string, unknown>, next: () => void): void {
    try {
      const attributes: Record<string, AnyValue> = {};

      // Correlate to the active trace so Grafana can jump log -> trace.
      const span = trace.getSpan(context.active());
      if (span) {
        const ctx = span.spanContext();
        attributes['trace_id'] = ctx.traceId;
        attributes['span_id'] = ctx.spanId;
      }
      if (typeof info['context'] === 'string') {
        attributes['logger'] = info['context'];
      }

      this.emitLog({
        body: String(info['message'] ?? ''),
        severityNumber: SEVERITY[String(info['level'])] ?? SeverityNumber.INFO,
        severityText: String(info['level']),
        attributes,
      });
    } catch {
      // A logging transport that throws inside an error handler is how the
      // original error gets lost. Swallow and move on.
    }
    // Outside the try: Winston's pipeline stalls if next() is never called,
    // so a failed emit must not also wedge logging.
    next();
  }
}

export function createOtlpTransport(emit: Emit = defaultEmit): Transport | undefined {
  if (process.env['OTEL_SDK_DISABLED'] === 'true') return undefined;
  return new OtlpTransport(emit);
}
