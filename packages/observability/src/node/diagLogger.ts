import type { DiagLogger } from '@opentelemetry/api';

type DiagMethod = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

const METHODS: readonly DiagMethod[] = ['error', 'warn', 'info', 'debug', 'verbose'];

/**
 * Wraps a DiagLogger so each distinct (level, message) pair is forwarded to
 * the delegate only once per process lifetime.
 *
 * OTel's diag API has no built-in rate limiting: with a plain DiagConsoleLogger,
 * a down or slow collector means every export attempt (every 30s metrics
 * interval and every trace batch, indefinitely) prints its own ERROR line —
 * burying the operator-facing log stream in Dokploy during exactly the
 * incident where real errors need to stand out. The first occurrence of any
 * message still reaches the delegate, so a genuinely new failure (e.g. a
 * typo'd endpoint) is never silently swallowed — only repeats are dropped.
 */
export function createDeduplicatingDiagLogger(delegate: DiagLogger): DiagLogger {
  const seen = new Set<string>();

  const wrap = (method: DiagMethod): DiagLogger[DiagMethod] => {
    return (message: string, ...args: unknown[]): void => {
      const key = `${method}:${message}`;
      if (seen.has(key)) return;
      seen.add(key);
      delegate[method](message, ...args);
    };
  };

  const logger = {} as DiagLogger;
  for (const method of METHODS) {
    logger[method] = wrap(method);
  }
  return logger;
}
