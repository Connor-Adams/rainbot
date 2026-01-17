import { log } from './config';
import { startBatchProcessor } from './batch';
import { webEventBuffer } from './store';

/**
 * Track a web dashboard event
 */
export function trackWebEvent(
  userId: string,
  eventType: string,
  eventTarget: string | null = null,
  eventValue: string | null = null,
  guildId: string | null = null,
  durationMs: number | null = null,
  webSessionId: string | null = null
): void {
  try {
    webEventBuffer.push({
      web_session_id: webSessionId,
      user_id: userId,
      event_type: eventType,
      event_target: eventTarget,
      event_value: eventValue,
      guild_id: guildId,
      duration_ms: durationMs,
      created_at: new Date(),
    });

    log.debug(`Tracked web event: ${eventType} by ${userId}`);
    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to track web event: ${err.message}`);
  }
}
