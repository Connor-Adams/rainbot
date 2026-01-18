import { BATCH_SIZE, log } from './config';
import { flushBatches, startBatchProcessor } from './batch';
import { voiceBuffer } from './store';
import type { Source, VoiceEventType } from './types';

/**
 * Track voice event
 */
export function trackVoiceEvent(
  eventType: string,
  guildId: string,
  channelId: string,
  channelName: string | null = null,
  source: string = 'discord'
): void {
  if (!eventType || !guildId || !channelId) {
    log.debug('Invalid voice event tracking data, skipping');
    return;
  }

  try {
    voiceBuffer.push({
      event_type: eventType as VoiceEventType,
      guild_id: guildId,
      channel_id: channelId,
      channel_name: channelName,
      executed_at: new Date(),
      source: (source === 'api' ? 'api' : 'discord') as Source,
    });

    if (voiceBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err: Error) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking voice event: ${err.message}`);
  }
}
