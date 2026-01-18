import { BATCH_SIZE, log } from './config';
import { flushBatches, startBatchProcessor } from './batch';
import { queueBuffer } from './store';
import type { OperationType, Source } from './types';

/**
 * Track queue operation
 */
export function trackQueueOperation(
  operationType: string,
  userId: string,
  guildId: string,
  source: string = 'discord',
  metadata: Record<string, unknown> | null = null
): void {
  if (!operationType || !userId || !guildId) {
    log.debug('Invalid queue operation tracking data, skipping');
    return;
  }

  try {
    queueBuffer.push({
      operation_type: operationType as OperationType,
      user_id: userId,
      guild_id: guildId,
      executed_at: new Date(),
      source: (source === 'api' ? 'api' : 'discord') as Source,
      metadata,
    });

    if (queueBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err: Error) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking queue operation: ${err.message}`);
  }
}
