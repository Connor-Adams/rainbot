import { log } from './config';
import { startBatchProcessor } from './batch';
import { playbackStateChangeBuffer } from './store';
import type { PlaybackStateType } from './types';

/**
 * Track a playback state change (volume, pause, resume, seek, etc.)
 */
export function trackPlaybackStateChange(
  guildId: string,
  channelId: string | null,
  stateType: PlaybackStateType,
  oldValue: string | null,
  newValue: string | null,
  userId: string | null = null,
  username: string | null = null,
  trackTitle: string | null = null,
  trackPositionSeconds: number | null = null,
  source: 'discord' | 'api' = 'discord'
): void {
  try {
    playbackStateChangeBuffer.push({
      guild_id: guildId,
      channel_id: channelId,
      state_type: stateType,
      old_value: oldValue,
      new_value: newValue,
      user_id: userId,
      username,
      track_title: trackTitle,
      track_position_seconds: trackPositionSeconds,
      source,
      created_at: new Date(),
    });

    log.debug(`Tracked ${stateType} change: ${oldValue} -> ${newValue} in guild ${guildId}`);
    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to track playback state: ${err.message}`);
  }
}
