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
    if (!url.port && (url.hostname === 'localhost' || url.hostname.startsWith('127.'))) {
      const defaultPort =
        process.env['RAILWAY_ENVIRONMENT'] || process.env['RAILWAY_PUBLIC_DOMAIN'] ? 8080 : 3000;
      url.port = String(defaultPort);
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
  logger?: ReturnType<typeof createLogger>;
}

/**
 * Register this worker with the orchestrator
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

  try {
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
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn(`Worker registration failed: ${response.status} ${text}`);
    } else {
      logger.info('Worker registered with orchestrator');
    }
  } catch (error) {
    const info = formatError(error);
    const err = error as { cause?: unknown };
    const cause =
      err.cause && typeof err.cause === 'object' && 'message' in err.cause
        ? (err.cause as { message?: string }).message
        : err.cause
          ? String(err.cause)
          : 'n/a';
    logger.warn(`Worker registration error: ${info.message}; cause=${cause}`);
    if (info.stack) {
      logger.debug(info.stack);
    }
  }
}
