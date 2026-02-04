import { createLogger } from '@rainbot/shared';
import { formatError } from './errors';
import type { BotType } from '@rainbot/types/core';

export type { BotType };

/**
 * Get the orchestrator base URL from environment variables
 */
export function getOrchestratorBaseUrl(raincloudUrl?: string): string | null {
  const RAINCLOUD_URL = raincloudUrl || process.env['RAINCLOUD_URL'];
  if (!RAINCLOUD_URL) return null;
  const normalized = RAINCLOUD_URL.match(/^https?:\/\//)
    ? RAINCLOUD_URL
    : `http://${RAINCLOUD_URL}`;

  try {
    const url = new URL(normalized);
    // When no port is set, use RAINCLOUD_PORT if set (e.g. 3000 when Raincloud uses PORT=3000 on Railway),
    // else default to 8080 on Railway or 3000 locally; otherwise fetch would use port 80 and time out.
    if (!url.port || url.port === '') {
      const envPort = process.env['RAINCLOUD_PORT'];
      const explicitPort = envPort ? String(envPort).trim() : '';
      const defaultPort =
        explicitPort && /^\d+$/.test(explicitPort)
          ? explicitPort
          : process.env['RAILWAY_ENVIRONMENT'] || process.env['RAILWAY_PUBLIC_DOMAIN']
            ? '8080'
            : '3000';
      url.port = defaultPort;
    }
    const normalizedPath = url.pathname.replace(/\/$/, '');
    return `${url.origin}${normalizedPath}`;
  } catch {
    return null;
  }
}

export interface RegisterWithOrchestratorOptions {
  botType: BotType;
  raincloudUrl?: string;
  workerSecret?: string;
  instanceId?: string;
  version?: string;
  /** Max attempts including first (default 4). Retries use exponential backoff. */
  maxAttempts?: number;
  /** Timeout per attempt in ms (default 15000). */
  requestTimeoutMs?: number;
  logger?: ReturnType<typeof createLogger>;
}

const DEFAULT_REGISTER_MAX_ATTEMPTS = 4;
const DEFAULT_REGISTER_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Register this worker with the orchestrator.
 * Retries with exponential backoff so workers can start before Raincloud is ready (e.g. deploy order).
 */
export async function registerWithOrchestrator(
  options: RegisterWithOrchestratorOptions
): Promise<void> {
  const {
    botType,
    raincloudUrl,
    workerSecret = process.env['WORKER_SECRET'],
    instanceId = process.env['RAILWAY_REPLICA_ID'] ||
      process.env['RAILWAY_SERVICE_ID'] ||
      process.env['HOSTNAME'],
    version = process.env['RAILWAY_GIT_COMMIT_SHA'] || process.env['GIT_COMMIT_SHA'],
    maxAttempts = DEFAULT_REGISTER_MAX_ATTEMPTS,
    requestTimeoutMs = DEFAULT_REGISTER_TIMEOUT_MS,
    logger = createLogger(botType.toUpperCase()),
  } = options;

  const RAINCLOUD_URL = raincloudUrl || process.env['RAINCLOUD_URL'];

  if (!RAINCLOUD_URL || !workerSecret) {
    logger.warn('Worker registration skipped (missing RAINCLOUD_URL or WORKER_SECRET)');
    return;
  }

  const baseUrl = getOrchestratorBaseUrl(RAINCLOUD_URL);
  if (!baseUrl) {
    logger.warn('Worker registration skipped (invalid RAINCLOUD_URL)');
    return;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
      const response = await fetch(`${baseUrl}/internal/workers/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': workerSecret,
        },
        body: JSON.stringify({
          botType,
          instanceId,
          startedAt: new Date().toISOString(),
          version,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        logger.warn(`Worker registration failed: ${response.status} ${text}`);
        return;
      }
      logger.info('Worker registered with orchestrator');
      return;
    } catch (error) {
      const info = formatError(error);
      const err = error as { cause?: unknown };
      const cause =
        err.cause && typeof err.cause === 'object' && 'message' in err.cause
          ? (err.cause as { message?: string }).message
          : err.cause
            ? String(err.cause)
            : 'n/a';
      if (attempt < maxAttempts) {
        const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
        logger.warn(
          `Worker registration attempt ${attempt}/${maxAttempts} failed (${info.message}; cause=${cause}), retrying in ${delayMs}ms...`
        );
        await sleep(delayMs);
      } else {
        logger.warn(
          `Worker registration error after ${maxAttempts} attempts: ${info.message}; cause=${cause}`
        );
        if (info.stack) {
          logger.debug(info.stack);
        }
      }
    }
  }
}
