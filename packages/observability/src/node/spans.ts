import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const tracer = trace.getTracer('@rainbot/observability');

export interface WithSpanOptions {
  /**
   * Start a new trace instead of joining the active one. For work that is
   * triggered by an event rather than requested: such work runs in whatever
   * async context the emitter was created in, so it would otherwise be filed
   * under an unrelated request's trace.
   */
  root?: boolean;
}

/**
 * Wraps an operation in a span. The span always ends, the error is always
 * rethrown — instrumentation must not change control flow.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
  options: WithSpanOptions = {}
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes, root: options.root }, async (span) => {
    try {
      return await fn();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
