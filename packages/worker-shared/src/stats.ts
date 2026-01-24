import { createLogger } from '@rainbot/shared';
import { getOrchestratorBaseUrl } from './orchestrator';
import { logErrorWithStack } from './errors';

export interface ReportSoundStatPayload {
  soundName: string;
  userId: string;
  guildId: string;
  sourceType?: string;
  isSoundboard?: boolean;
  duration?: number | null;
  source?: string;
  username?: string | null;
  discriminator?: string | null;
}

/**
 * Report sound playback statistics to the orchestrator
 */
export async function reportSoundStat(
  payload: ReportSoundStatPayload,
  options?: {
    workerSecret?: string;
    raincloudUrl?: string;
    logger?: ReturnType<typeof createLogger>;
  }
): Promise<void> {
  const workerSecret = options?.workerSecret || process.env['WORKER_SECRET'];
  if (!workerSecret) return;

  const baseUrl = getOrchestratorBaseUrl(options?.raincloudUrl);
  if (!baseUrl) return;

  const logger = options?.logger || createLogger('STATS');

  try {
    const response = await fetch(`${baseUrl}/internal/stats/sound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': workerSecret,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      logger.warn(`Stats report failed: ${response.status} ${text}`);
    }
  } catch (error) {
    logErrorWithStack(logger, 'Stats report failed', error);
  }
}
