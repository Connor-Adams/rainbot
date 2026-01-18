import { query } from '../database';
import { log } from './config';
import { activeSessions } from './store';
import type { Source, VoiceSessionEvent } from './types';

/**
 * Start a voice session (called when bot joins voice)
 */
export function startVoiceSession(
  guildId: string,
  channelId: string,
  channelName: string | null = null,
  source: string = 'discord'
): string {
  const sessionId = `${guildId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const session: VoiceSessionEvent = {
    session_id: sessionId,
    guild_id: guildId,
    channel_id: channelId,
    channel_name: channelName,
    started_at: new Date(),
    ended_at: null,
    duration_seconds: null,
    tracks_played: 0,
    user_count_peak: 1,
    source: (source === 'api' ? 'api' : 'discord') as Source,
  };

  activeSessions.set(guildId, session);
  log.debug(`Started voice session ${sessionId} for guild ${guildId}`);

  return sessionId;
}

/**
 * End a voice session (called when bot leaves voice)
 */
export async function endVoiceSession(guildId: string): Promise<void> {
  const session = activeSessions.get(guildId);
  if (!session) {
    log.debug(`No active session found for guild ${guildId}`);
    return;
  }

  session.ended_at = new Date();
  session.duration_seconds = Math.floor(
    (session.ended_at.getTime() - session.started_at.getTime()) / 1000
  );

  try {
    await query(
      `INSERT INTO voice_sessions (session_id, guild_id, channel_id, channel_name, started_at, ended_at, duration_seconds, tracks_played, user_count_peak, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        session.session_id,
        session.guild_id,
        session.channel_id,
        session.channel_name,
        session.started_at,
        session.ended_at,
        session.duration_seconds,
        session.tracks_played,
        session.user_count_peak,
        session.source,
      ]
    );
    log.debug(
      `Ended voice session ${session.session_id} - duration: ${session.duration_seconds}s, tracks: ${session.tracks_played}`
    );
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to save voice session: ${err.message}`);
  }

  activeSessions.delete(guildId);
}

/**
 * Increment tracks played in active session
 */
export function incrementSessionTracks(guildId: string): void {
  const session = activeSessions.get(guildId);
  if (session) {
    session.tracks_played++;
  }
}

/**
 * Update peak user count in active session
 */
export function updateSessionPeakUsers(guildId: string, userCount: number): void {
  const session = activeSessions.get(guildId);
  if (session && userCount > session.user_count_peak) {
    session.user_count_peak = userCount;
  }
}

/**
 * Get active session for a guild
 */
export function getActiveSession(guildId: string): VoiceSessionEvent | undefined {
  return activeSessions.get(guildId);
}
