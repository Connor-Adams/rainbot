import type { DiagLogger } from '@opentelemetry/api';

type DiagMethod = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

const METHODS: readonly DiagMethod[] = ['error', 'warn', 'info', 'debug', 'verbose'];

/**
 * How often the dedup window resets. Without this, a message suppressed once
 * (e.g. a collector outage) stays silent for the rest of the process's life —
 * a second, unrelated outage hours later would never print at all. Long
 * enough that normal operation still only prints a given message once in
 * practice; short enough that a later incident isn't invisible for the
 * remaining lifetime of a long-running bot process.
 */
const DEFAULT_REARM_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Wraps a DiagLogger so each distinct (level, message) pair is forwarded to
 * the delegate only once per dedup window, with an occasional summary of how
 * much was suppressed.
 *
 * OTel's diag API has no built-in rate limiting: with a plain DiagConsoleLogger,
 * a down or slow collector means every export attempt (every 30s metrics
 * interval and every trace batch, indefinitely) prints its own ERROR line —
 * burying the operator-facing log stream in Dokploy during exactly the
 * incident where real errors need to stand out. The first occurrence of any
 * message still reaches the delegate, so a genuinely new failure (e.g. a
 * typo'd endpoint) is never silently swallowed — only repeats are dropped,
 * and only until the window resets.
 *
 * `rearmIntervalMs` is only a test seam (real callers rely on the default) —
 * it's kept cheap via an unref'd timer, which also means it never fires when
 * telemetry is disabled: this function is only ever reached from inside
 * startTelemetry(), which returns immediately when OTEL_SDK_DISABLED=true.
 */
export function createDeduplicatingDiagLogger(
  delegate: DiagLogger,
  rearmIntervalMs = DEFAULT_REARM_INTERVAL_MS
): DiagLogger {
  let seen = new Map<string, number>();

  const rearmTimer = setInterval(() => {
    let suppressed = 0;
    for (const count of seen.values()) {
      suppressed += count - 1;
    }
    if (suppressed > 0) {
      delegate.warn(
        `diag logger: dedup window reset after suppressing ${suppressed} repeat message(s)`
      );
    }
    seen = new Map();
  }, rearmIntervalMs);
  rearmTimer.unref?.();

  const wrap = (method: DiagMethod): DiagLogger[DiagMethod] => {
    return (message: string, ...args: unknown[]): void => {
      const key = `${method}:${message}`;
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count > 0) return;
      delegate[method](message, ...args);
    };
  };

  const logger = {} as DiagLogger;
  for (const method of METHODS) {
    logger[method] = wrap(method);
  }
  return logger;
}
