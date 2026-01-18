import { query } from '../database';
import { BATCH_INTERVAL, BATCH_SIZE, log, statsEmitter } from './config';
import type {
  ApiLatencyEvent,
  BufferType,
  CommandEvent,
  GuildEvent,
  InteractionEvent,
  PlaybackStateChangeEvent,
  QueueEvent,
  SearchEvent,
  SoundEvent,
  TrackEngagementEvent,
  UserProfile,
  UserSessionEvent,
  UserTrackListenEvent,
  VoiceEvent,
  WebEvent,
} from './types';
import {
  apiLatencyBuffer,
  bufferMap,
  commandBuffer,
  guildEventBuffer,
  interactionEventBuffer,
  playbackStateChangeBuffer,
  queueBuffer,
  searchBuffer,
  soundBuffer,
  trackEngagementBuffer,
  userSessionBuffer,
  userTrackListenBuffer,
  voiceBuffer,
  webEventBuffer,
} from './store';

let batchTimer: NodeJS.Timeout | null = null;

/**
 * Start batch processing timer
 */
export function startBatchProcessor(): void {
  if (batchTimer) return;

  batchTimer = setInterval(() => {
    flushBatches().catch((error: Error) => {
      log.error(`Error flushing batches: ${error.message}`);
    });
  }, BATCH_INTERVAL);

  log.debug('Batch processor started');
}

export function stopBatchProcessor(): void {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}

/**
 * Flush all buffered events to database (parallel inserts)
 */
export async function flushBatches(): Promise<void> {
  const batches: Array<{ name: BufferType; buffer: unknown[]; table: string }> = [
    { name: 'commands', buffer: commandBuffer, table: 'command_stats' },
    { name: 'sounds', buffer: soundBuffer, table: 'sound_stats' },
    { name: 'queue', buffer: queueBuffer, table: 'queue_operations' },
    { name: 'voice', buffer: voiceBuffer, table: 'voice_events' },
    { name: 'search', buffer: searchBuffer, table: 'search_stats' },
    { name: 'userSessions', buffer: userSessionBuffer, table: 'user_voice_sessions' },
    { name: 'userTrackListens', buffer: userTrackListenBuffer, table: 'user_track_listens' },
    { name: 'trackEngagement', buffer: trackEngagementBuffer, table: 'track_engagement' },
    { name: 'interactionEvents', buffer: interactionEventBuffer, table: 'interaction_events' },
    {
      name: 'playbackStateChanges',
      buffer: playbackStateChangeBuffer,
      table: 'playback_state_changes',
    },
    { name: 'webEvents', buffer: webEventBuffer, table: 'web_events' },
    { name: 'guildEvents', buffer: guildEventBuffer, table: 'guild_events' },
    { name: 'apiLatency', buffer: apiLatencyBuffer, table: 'api_latency' },
  ];

  const insertPromises: Promise<void>[] = [];
  for (const { name, buffer, table } of batches) {
    if (buffer.length === 0) continue;

    const events = buffer.splice(0, BATCH_SIZE);
    insertPromises.push(insertBatch(name, table, events));
  }

  if (insertPromises.length > 0) {
    await Promise.all(insertPromises);
  }
}

/**
 * Upsert user profiles for username lookup
 */
async function upsertUserProfiles(
  events: Array<{ user_id?: string; username?: string | null; discriminator?: string | null }>
): Promise<void> {
  const profilesById = new Map<string, UserProfile>();

  for (const event of events) {
    if (!event.user_id) continue;
    if (!event.username && !event.discriminator) continue;

    profilesById.set(event.user_id, {
      user_id: event.user_id,
      username: event.username || null,
      discriminator: event.discriminator || null,
    });
  }

  if (profilesById.size === 0) return;

  const profiles = Array.from(profilesById.values());
  const values = profiles
    .map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`)
    .join(', ');

  const params = profiles.flatMap((profile) => [
    profile.user_id,
    profile.username,
    profile.discriminator,
    new Date(),
  ]);

  try {
    await query(
      `INSERT INTO user_profiles (user_id, username, discriminator, updated_at) VALUES ${values}
             ON CONFLICT (user_id) DO UPDATE SET
                 username = COALESCE(EXCLUDED.username, user_profiles.username),
                 discriminator = COALESCE(EXCLUDED.discriminator, user_profiles.discriminator),
                 updated_at = EXCLUDED.updated_at`,
      params
    );
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to upsert user profiles: ${err.message}`);
  }
}

/**
 * Insert a batch of events into the database
 */
async function insertBatch(type: BufferType, table: string, events: unknown[]): Promise<void> {
  if (events.length === 0) return;

  try {
    if (table === 'command_stats') {
      const commandEvents = events as CommandEvent[];
      const values = commandEvents
        .map(
          (_, i) =>
            `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11})`
        )
        .join(', ');

      const params = commandEvents.flatMap((e) => [
        e.command_name,
        e.user_id,
        e.username || null,
        e.discriminator || null,
        e.guild_id,
        e.source,
        e.executed_at || new Date(),
        e.success,
        e.error_message || null,
        e.execution_time_ms || null,
        e.error_type || null,
      ]);

      await query(
        `INSERT INTO command_stats (command_name, user_id, username, discriminator, guild_id, source, executed_at, success, error_message, execution_time_ms, error_type) VALUES ${values}`,
        params
      );

      await upsertUserProfiles(commandEvents);
    } else if (table === 'sound_stats') {
      const soundEvents = events as SoundEvent[];
      const values = soundEvents
        .map(
          (_, i) =>
            `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`
        )
        .join(', ');

      const params = soundEvents.flatMap((e) => [
        e.sound_name,
        e.user_id,
        e.username || null,
        e.discriminator || null,
        e.guild_id,
        e.source_type,
        e.is_soundboard,
        e.played_at || new Date(),
        e.duration || null,
        e.source,
      ]);

      await query(
        `INSERT INTO sound_stats (sound_name, user_id, username, discriminator, guild_id, source_type, is_soundboard, played_at, duration, source) VALUES ${values}`,
        params
      );

      await upsertUserProfiles(soundEvents);
    } else if (table === 'queue_operations') {
      const queueEvents = events as QueueEvent[];
      const values = queueEvents
        .map(
          (_, i) =>
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        )
        .join(', ');

      const params = queueEvents.flatMap((e) => [
        e.operation_type,
        e.user_id,
        e.guild_id,
        e.executed_at || new Date(),
        e.source,
        e.metadata ? JSON.stringify(e.metadata) : null,
      ]);

      await query(
        `INSERT INTO queue_operations (operation_type, user_id, guild_id, executed_at, source, metadata) VALUES ${values}`,
        params
      );
    } else if (table === 'voice_events') {
      const voiceEvents = events as VoiceEvent[];
      const values = voiceEvents
        .map(
          (_, i) =>
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        )
        .join(', ');

      const params = voiceEvents.flatMap((e) => [
        e.event_type,
        e.guild_id,
        e.channel_id,
        e.channel_name || null,
        e.executed_at || new Date(),
        e.source,
      ]);

      await query(
        `INSERT INTO voice_events (event_type, guild_id, channel_id, channel_name, executed_at, source) VALUES ${values}`,
        params
      );
    } else if (table === 'search_stats') {
      const searchEvents = events as SearchEvent[];
      const values = searchEvents
        .map(
          (_, i) =>
            `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`
        )
        .join(', ');

      const params = searchEvents.flatMap((e) => [
        e.user_id,
        e.guild_id,
        e.query,
        e.query_type,
        e.results_count,
        e.selected_index,
        e.selected_title || null,
        e.searched_at || new Date(),
        e.source,
      ]);

      await query(
        `INSERT INTO search_stats (user_id, guild_id, query, query_type, results_count, selected_index, selected_title, searched_at, source) VALUES ${values}`,
        params
      );
    } else if (table === 'user_voice_sessions') {
      const sessionEvents = events as UserSessionEvent[];
      const values = sessionEvents
        .map(
          (_, i) =>
            `($${i * 12 + 1}, $${i * 12 + 2}, $${i * 12 + 3}, $${i * 12 + 4}, $${i * 12 + 5}, $${i * 12 + 6}, $${i * 12 + 7}, $${i * 12 + 8}, $${i * 12 + 9}, $${i * 12 + 10}, $${i * 12 + 11}, $${i * 12 + 12})`
        )
        .join(', ');

      const params = sessionEvents.flatMap((e) => [
        e.session_id,
        e.bot_session_id,
        e.user_id,
        e.username,
        e.discriminator,
        e.guild_id,
        e.channel_id,
        e.channel_name,
        e.joined_at,
        e.left_at,
        e.duration_seconds,
        e.tracks_heard,
      ]);

      await query(
        `INSERT INTO user_voice_sessions (session_id, bot_session_id, user_id, username, discriminator, guild_id, channel_id, channel_name, joined_at, left_at, duration_seconds, tracks_heard) VALUES ${values}`,
        params
      );

      await upsertUserProfiles(sessionEvents);
    } else if (table === 'user_track_listens') {
      const listenEvents = events as UserTrackListenEvent[];
      const values = listenEvents
        .map(
          (_, i) =>
            `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`
        )
        .join(', ');

      const params = listenEvents.flatMap((e) => [
        e.user_session_id,
        e.user_id,
        e.guild_id,
        e.track_title,
        e.track_url,
        e.source_type,
        e.duration,
        e.listened_at,
        e.queued_by,
      ]);

      await query(
        `INSERT INTO user_track_listens (user_session_id, user_id, guild_id, track_title, track_url, source_type, duration, listened_at, queued_by) VALUES ${values}`,
        params
      );
    } else if (table === 'track_engagement') {
      const engagementEvents = events as TrackEngagementEvent[];
      const values = engagementEvents
        .map(
          (_, i) =>
            `($${i * 17 + 1}, $${i * 17 + 2}, $${i * 17 + 3}, $${i * 17 + 4}, $${i * 17 + 5}, $${i * 17 + 6}, $${i * 17 + 7}, $${i * 17 + 8}, $${i * 17 + 9}, $${i * 17 + 10}, $${i * 17 + 11}, $${i * 17 + 12}, $${i * 17 + 13}, $${i * 17 + 14}, $${i * 17 + 15}, $${i * 17 + 16}, $${i * 17 + 17})`
        )
        .join(', ');

      const params = engagementEvents.flatMap((e) => [
        e.engagement_id,
        e.track_title,
        e.track_url,
        e.guild_id,
        e.channel_id,
        e.source_type,
        e.started_at,
        e.ended_at,
        e.duration_seconds,
        e.played_seconds,
        e.was_skipped,
        e.skipped_at_seconds,
        e.was_completed,
        e.skip_reason,
        e.queued_by,
        e.skipped_by,
        e.listeners_at_start,
      ]);

      await query(
        `INSERT INTO track_engagement (engagement_id, track_title, track_url, guild_id, channel_id, source_type, started_at, ended_at, duration_seconds, played_seconds, was_skipped, skipped_at_seconds, was_completed, skip_reason, queued_by, skipped_by, listeners_at_start) VALUES ${values}`,
        params
      );
    } else if (table === 'interaction_events') {
      const interactionEvents = events as InteractionEvent[];
      const values = interactionEvents
        .map(
          (_, i) =>
            `($${i * 12 + 1}, $${i * 12 + 2}, $${i * 12 + 3}, $${i * 12 + 4}, $${i * 12 + 5}, $${i * 12 + 6}, $${i * 12 + 7}, $${i * 12 + 8}, $${i * 12 + 9}, $${i * 12 + 10}, $${i * 12 + 11}, $${i * 12 + 12})`
        )
        .join(', ');

      const params = interactionEvents.flatMap((e) => [
        e.interaction_type,
        e.interaction_id,
        e.custom_id,
        e.user_id,
        e.username,
        e.guild_id,
        e.channel_id,
        e.response_time_ms,
        e.success,
        e.error_message,
        e.metadata ? JSON.stringify(e.metadata) : null,
        e.created_at,
      ]);

      await query(
        `INSERT INTO interaction_events (interaction_type, interaction_id, custom_id, user_id, username, guild_id, channel_id, response_time_ms, success, error_message, metadata, created_at) VALUES ${values}`,
        params
      );
    } else if (table === 'playback_state_changes') {
      const stateEvents = events as PlaybackStateChangeEvent[];
      const values = stateEvents
        .map(
          (_, i) =>
            `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11})`
        )
        .join(', ');

      const params = stateEvents.flatMap((e) => [
        e.guild_id,
        e.channel_id,
        e.state_type,
        e.old_value,
        e.new_value,
        e.user_id,
        e.username,
        e.track_title,
        e.track_position_seconds,
        e.source,
        e.created_at,
      ]);

      await query(
        `INSERT INTO playback_state_changes (guild_id, channel_id, state_type, old_value, new_value, user_id, username, track_title, track_position_seconds, source, created_at) VALUES ${values}`,
        params
      );
    } else if (table === 'web_events') {
      const webEvents = events as WebEvent[];
      const values = webEvents
        .map(
          (_, i) =>
            `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
        )
        .join(', ');

      const params = webEvents.flatMap((e) => [
        e.web_session_id,
        e.user_id,
        e.event_type,
        e.event_target,
        e.event_value,
        e.guild_id,
        e.duration_ms,
        e.created_at,
      ]);

      await query(
        `INSERT INTO web_events (web_session_id, user_id, event_type, event_target, event_value, guild_id, duration_ms, created_at) VALUES ${values}`,
        params
      );
    } else if (table === 'guild_events') {
      const guildEvents = events as GuildEvent[];
      const values = guildEvents
        .map(
          (_, i) =>
            `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
        )
        .join(', ');

      const params = guildEvents.flatMap((e) => [
        e.event_type,
        e.guild_id,
        e.guild_name,
        e.member_count,
        e.user_id,
        e.metadata ? JSON.stringify(e.metadata) : null,
        e.created_at,
      ]);

      await query(
        `INSERT INTO guild_events (event_type, guild_id, guild_name, member_count, user_id, metadata, created_at) VALUES ${values}`,
        params
      );
    } else if (table === 'api_latency') {
      const latencyEvents = events as ApiLatencyEvent[];
      const values = latencyEvents
        .map(
          (_, i) =>
            `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
        )
        .join(', ');

      const params = latencyEvents.flatMap((e) => [
        e.endpoint,
        e.method,
        e.response_time_ms,
        e.status_code,
        e.user_id,
        e.request_size_bytes,
        e.response_size_bytes,
        e.created_at,
      ]);

      await query(
        `INSERT INTO api_latency (endpoint, method, response_time_ms, status_code, user_id, request_size_bytes, response_size_bytes, created_at) VALUES ${values}`,
        params
      );
    }

    log.debug(`Inserted ${events.length} ${type} events`);
    try {
      statsEmitter.emit('batchInserted', {
        type,
        table,
        count: events.length,
        ts: new Date().toISOString(),
      });
    } catch {
      /* ignore emitter errors */
    }
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to insert ${type} batch: ${err.message}`);
    const buffer = bufferMap[type];
    if (buffer && buffer.length < BATCH_SIZE * 10) {
      buffer.unshift(...events);
    }
  }
}
