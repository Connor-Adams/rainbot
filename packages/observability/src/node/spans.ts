import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const tracer = trace.getTracer('@rainbot/observability');

/**
 * Wraps an operation in a span. The span always ends, the error is always
 * rethrown — instrumentation must not change control flow.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
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
