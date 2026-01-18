import type { SourceType } from '../sourceType';
import { BATCH_SIZE, log } from './config';
import { flushBatches, startBatchProcessor } from './batch';
import { activeUserSessions, userSessionBuffer, userTrackListenBuffer } from './store';
import type { ActiveUserSession } from './types';
import { getActiveSession, updateSessionPeakUsers } from './voiceSessions';

/**
 * Start tracking a user's voice session when they join the bot's channel
 */
export function startUserSession(
  userId: string,
  guildId: string,
  channelId: string,
  channelName: string | null = null,
  username: string | null = null,
  discriminator: string | null = null
): string {
  try {
    const key = `${guildId}:${channelId}:${userId}`;

    if (activeUserSessions.has(key)) {
      return activeUserSessions.get(key)!.sessionId;
    }

    const sessionId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const botSession = getActiveSession(guildId);

    const session: ActiveUserSession = {
      sessionId,
      botSessionId: botSession?.session_id || null,
      userId,
      username,
      discriminator,
      guildId,
      channelId,
      channelName,
      joinedAt: new Date(),
      tracksHeard: 0,
      trackTitles: [],
    };

    activeUserSessions.set(key, session);
    log.debug(`Started user session ${sessionId} for user ${userId} in guild ${guildId}`);

    updatePeakUsersForGuild(guildId, channelId);

    return sessionId;
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to start user session: ${err.message}`);
    return `${userId}-${Date.now()}-failed`;
  }
}

/**
 * End a user's voice session when they leave the bot's channel
 */
export async function endUserSession(
  userId: string,
  guildId: string,
  channelId: string
): Promise<void> {
  try {
    const key = `${guildId}:${channelId}:${userId}`;
    const session = activeUserSessions.get(key);

    if (!session) {
      log.debug(`No active user session found for user ${userId} in guild ${guildId}`);
      return;
    }

    const leftAt = new Date();
    const durationSeconds = Math.floor((leftAt.getTime() - session.joinedAt.getTime()) / 1000);

    userSessionBuffer.push({
      session_id: session.sessionId,
      bot_session_id: session.botSessionId,
      user_id: session.userId,
      username: session.username,
      discriminator: session.discriminator,
      guild_id: session.guildId,
      channel_id: session.channelId,
      channel_name: session.channelName,
      joined_at: session.joinedAt,
      left_at: leftAt,
      duration_seconds: durationSeconds,
      tracks_heard: session.tracksHeard,
    });

    activeUserSessions.delete(key);
    log.debug(
      `Ended user session ${session.sessionId} - duration: ${durationSeconds}s, tracks: ${session.tracksHeard}`
    );

    if (userSessionBuffer.length >= BATCH_SIZE) {
      await flushBatches();
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to end user session: ${err.message}`);
  }
}

/**
 * Track that users heard a track (called when a track starts playing)
 */
export function trackUserListen(
  guildId: string,
  channelId: string,
  trackTitle: string,
  trackUrl: string | null,
  sourceType: SourceType,
  duration: number | null,
  queuedBy: string | null
): void {
  try {
    const usersInChannel = getUsersInChannel(guildId, channelId);

    for (const session of usersInChannel) {
      if (session.trackTitles.includes(trackTitle)) continue;

      session.tracksHeard++;
      session.trackTitles.push(trackTitle);

      userTrackListenBuffer.push({
        user_session_id: session.sessionId,
        user_id: session.userId,
        guild_id: guildId,
        track_title: trackTitle,
        track_url: trackUrl,
        source_type: sourceType,
        duration,
        listened_at: new Date(),
        queued_by: queuedBy,
      });
    }

    if (userTrackListenBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err: Error) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to track user listen: ${err.message}`);
  }
}

/**
 * Get all active user sessions in a specific channel
 */
export function getUsersInChannel(guildId: string, channelId: string): ActiveUserSession[] {
  const users: ActiveUserSession[] = [];

  for (const [key, session] of activeUserSessions) {
    if (key.startsWith(`${guildId}:${channelId}:`)) {
      users.push(session);
    }
  }

  return users;
}

/**
 * End all user sessions for a guild (called when bot leaves)
 */
export async function endAllUserSessionsForGuild(guildId: string): Promise<void> {
  try {
    const sessionsToEnd: Array<{ userId: string; channelId: string }> = [];

    for (const [key, session] of activeUserSessions) {
      if (session.guildId === guildId) {
        const parts = key.split(':');
        const channelId = parts[1] || '';
        sessionsToEnd.push({ userId: session.userId, channelId });
      }
    }

    for (const { userId, channelId } of sessionsToEnd) {
      await endUserSession(userId, guildId, channelId);
    }

    log.debug(`Ended ${sessionsToEnd.length} user sessions for guild ${guildId}`);
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to end user sessions for guild: ${err.message}`);
  }
}

/**
 * Get active session for a specific user
 */
export function getActiveUserSession(
  userId: string,
  guildId: string,
  channelId: string
): ActiveUserSession | undefined {
  const key = `${guildId}:${channelId}:${userId}`;
  return activeUserSessions.get(key);
}

/**
 * Get count of active users in a guild's channel
 */
export function getActiveUserCount(guildId: string, channelId: string): number {
  return getUsersInChannel(guildId, channelId).length;
}

/**
 * Update peak user count for a guild's bot session
 */
function updatePeakUsersForGuild(guildId: string, channelId: string): void {
  const botSession = getActiveSession(guildId);
  if (!botSession) return;

  const userCount = getUsersInChannel(guildId, channelId).length;

  updateSessionPeakUsers(guildId, userCount);
}
