import type { SourceType } from '../sourceType';
import { log } from './config';
import { startBatchProcessor } from './batch';
import { activeTrackEngagements, trackEngagementBuffer } from './store';
import type { ActiveTrackEngagement, SkipReason } from './types';
import { getActiveUserCount } from './userSessions';

/**
 * Start tracking a track's engagement when it begins playing
 */
export function startTrackEngagement(
  guildId: string,
  channelId: string,
  trackTitle: string,
  trackUrl: string | null,
  sourceType: SourceType,
  durationSeconds: number | null,
  queuedBy: string | null
): string {
  try {
    const engagementId = `${guildId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const listenersAtStart = getActiveUserCount(guildId, channelId);

    const engagement = {
      engagementId,
      trackTitle,
      trackUrl,
      guildId,
      channelId,
      sourceType,
      startedAt: new Date(),
      durationSeconds,
      queuedBy,
      listenersAtStart,
    };

    activeTrackEngagements.set(guildId, engagement);
    log.debug(`Started track engagement ${engagementId} for "${trackTitle}" in guild ${guildId}`);

    return engagementId;
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to start track engagement: ${err.message}`);
    return `${guildId}-${Date.now()}-failed`;
  }
}

/**
 * End track engagement when track ends (completed, skipped, or error)
 */
export function endTrackEngagement(
  guildId: string,
  wasSkipped: boolean,
  skipReason: SkipReason | null = null,
  skippedBy: string | null = null,
  playedSeconds: number | null = null
): void {
  try {
    const engagement = activeTrackEngagements.get(guildId);
    if (!engagement) {
      log.debug(`No active track engagement found for guild ${guildId}`);
      return;
    }

    const endedAt = new Date();
    const actualPlayedSeconds =
      playedSeconds ?? Math.floor((endedAt.getTime() - engagement.startedAt.getTime()) / 1000);
    const wasCompleted =
      !wasSkipped &&
      engagement.durationSeconds !== null &&
      actualPlayedSeconds >= engagement.durationSeconds * 0.9;

    const listenersAtEnd = getActiveUserCount(guildId, engagement.channelId);

    trackEngagementBuffer.push({
      engagement_id: engagement.engagementId,
      track_title: engagement.trackTitle,
      track_url: engagement.trackUrl,
      guild_id: engagement.guildId,
      channel_id: engagement.channelId,
      source_type: engagement.sourceType,
      started_at: engagement.startedAt,
      ended_at: endedAt,
      duration_seconds: engagement.durationSeconds,
      played_seconds: actualPlayedSeconds,
      was_skipped: wasSkipped,
      skipped_at_seconds: wasSkipped ? actualPlayedSeconds : null,
      was_completed: wasCompleted,
      skip_reason: skipReason,
      queued_by: engagement.queuedBy,
      skipped_by: skippedBy,
      listeners_at_start: engagement.listenersAtStart,
      listeners_at_end: listenersAtEnd,
    });

    activeTrackEngagements.delete(guildId);
    log.debug(
      `Ended track engagement ${engagement.engagementId} - skipped: ${wasSkipped}, completed: ${wasCompleted}, played: ${actualPlayedSeconds}s`
    );

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to end track engagement: ${err.message}`);
  }
}

/**
 * Get active track engagement for a guild
 */
export function getActiveTrackEngagement(guildId: string): ActiveTrackEngagement | undefined {
  return activeTrackEngagements.get(guildId);
}
