import { log } from './config';
import { startBatchProcessor } from './batch';
import { interactionEventBuffer } from './store';
import type { InteractionType } from './types';

/**
 * Track an interaction event (button click, slash command, autocomplete, etc.)
 */
export function trackInteraction(
  interactionType: InteractionType,
  interactionId: string | null,
  customId: string | null,
  userId: string,
  username: string | null,
  guildId: string,
  channelId: string | null,
  responseTimeMs: number | null = null,
  success: boolean = true,
  errorMessage: string | null = null,
  metadata: Record<string, unknown> | null = null
): void {
  try {
    interactionEventBuffer.push({
      interaction_type: interactionType,
      interaction_id: interactionId,
      custom_id: customId,
      user_id: userId,
      username,
      guild_id: guildId,
      channel_id: channelId,
      response_time_ms: responseTimeMs,
      success,
      error_message: errorMessage,
      metadata,
      created_at: new Date(),
    });

    log.debug(`Tracked ${interactionType} interaction: ${customId || interactionId} by ${userId}`);
    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to track interaction: ${err.message}`);
  }
}
