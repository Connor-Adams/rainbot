import { log } from './config';
import { startBatchProcessor } from './batch';
import { guildEventBuffer } from './store';
import type { GuildEventType } from './types';

/**
 * Track a guild event (bot join/leave, member events)
 */
export function trackGuildEvent(
  eventType: GuildEventType,
  guildId: string,
  guildName: string | null = null,
  memberCount: number | null = null,
  userId: string | null = null,
  metadata: Record<string, unknown> | null = null
): void {
  try {
    guildEventBuffer.push({
      event_type: eventType,
      guild_id: guildId,
      guild_name: guildName,
      member_count: memberCount,
      user_id: userId,
      metadata,
      created_at: new Date(),
    });

    log.debug(`Tracked guild event: ${eventType} for guild ${guildId}`);
    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to track guild event: ${err.message}`);
  }
}
