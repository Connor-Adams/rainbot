/**
 * Format an error into a structured format with message and optional stack trace.
 * Includes error.cause when present (e.g. "fetch failed: connect ECONNREFUSED").
 */
export function formatError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    const cause = err.cause;
    let message = err.message;
    if (cause instanceof Error && cause.message && cause.message !== err.message) {
      message = `${err.message}: ${cause.message}`;
    } else if (typeof cause === 'string') {
      message = `${err.message}: ${cause}`;
    }
    return { message, stack: err.stack };
  }
  return { message: String(err) };
}
