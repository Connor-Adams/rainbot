import type { SourceType } from '../sourceType';
import { BATCH_SIZE, log } from './config';
import { flushBatches, startBatchProcessor } from './batch';
import { soundBuffer } from './store';
import type { Source } from './types';

/**
 * Track sound playback
 */
export function trackSound(
  soundName: string,
  userId: string,
  guildId: string,
  sourceType: SourceType = 'other',
  isSoundboard: boolean = false,
  duration: number | null = null,
  source: string = 'discord',
  username: string | null = null,
  discriminator: string | null = null
): void {
  if (!soundName || !userId || !guildId) {
    log.debug('Invalid sound tracking data, skipping');
    return;
  }

  try {
    soundBuffer.push({
      sound_name: soundName,
      user_id: userId,
      guild_id: guildId,
      username,
      discriminator,
      source_type: sourceType,
      is_soundboard: isSoundboard,
      played_at: new Date(),
      duration,
      source: (source === 'api' ? 'api' : 'discord') as Source,
    });

    if (soundBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err: Error) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking sound: ${err.message}`);
  }
}
