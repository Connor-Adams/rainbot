import { query } from './database';
import { createLogger } from './logger';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { SourceType } from './sourceType';

const log = createLogger('STATS');

// Emitter for notifying runtime listeners (SSE/WebSocket) about stats writes
export const statsEmitter = new EventEmitter();

// Batch processing configuration
const BATCH_SIZE = 100;
const BATCH_INTERVAL = 5000; // 5 seconds

type Source = 'discord' | 'api';
type OperationType = 'skip' | 'pause' | 'resume' | 'clear' | 'remove' | 'replay';
type VoiceEventType = 'join' | 'leave';
type ErrorType =
  | 'validation'
  | 'permission'
  | 'not_found'
  | 'rate_limit'
  | 'external_api'
  | 'internal'
  | 'timeout'
  | null;
type QueryType = 'search' | 'url' | 'playlist' | 'soundboard';

interface CommandEvent {
  command_name: string;
  user_id: string;
  guild_id: string;
  username: string | null;
  discriminator: string | null;
  source: Source;
  executed_at: Date;
  success: boolean;
  error_message: string | null;
  execution_time_ms: number | null;
  error_type: ErrorType;
}

interface SoundEvent {
  sound_name: string;
  user_id: string;
  guild_id: string;
  username: string | null;
  discriminator: string | null;
  source_type: SourceType;
  is_soundboard: boolean;
  played_at: Date;
  duration: number | null;
  source: Source;
}

interface SearchEvent {
  user_id: string;
  guild_id: string;
  query: string;
  query_type: QueryType;
  results_count: number | null;
  selected_index: number | null;
  selected_title: string | null;
  searched_at: Date;
  source: Source;
}

interface VoiceSessionEvent {
  session_id: string;
  guild_id: string;
  channel_id: string;
  channel_name: string | null;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  tracks_played: number;
  user_count_peak: number;
  source: Source;
}

interface QueueEvent {
  operation_type: OperationType;
  user_id: string;
  guild_id: string;
  executed_at: Date;
  source: Source;
  metadata: Record<string, unknown> | null;
}

interface VoiceEvent {
  event_type: VoiceEventType;
  guild_id: string;
  channel_id: string;
  channel_name: string | null;
  executed_at: Date;
  source: Source;
}

// Event buffers for batch processing
const commandBuffer: CommandEvent[] = [];
const soundBuffer: SoundEvent[] = [];
const queueBuffer: QueueEvent[] = [];
const voiceBuffer: VoiceEvent[] = [];
const searchBuffer: SearchEvent[] = [];

type BufferType =
  | 'commands'
  | 'sounds'
  | 'queue'
  | 'voice'
  | 'search'
  | 'userSessions'
  | 'userTrackListens'
  | 'trackEngagement'
  | 'interactionEvents'
  | 'playbackStateChanges'
  | 'webEvents'
  | 'guildEvents'
  | 'apiLatency';

// User session tracking interfaces
interface ActiveUserSession {
  sessionId: string;
  botSessionId: string | null;
  userId: string;
  username: string | null;
  discriminator: string | null;
  guildId: string;
  channelId: string;
  channelName: string | null;
  joinedAt: Date;
  tracksHeard: number;
  trackTitles: string[]; // For deduplication
}

interface UserSessionEvent {
  session_id: string;
  bot_session_id: string | null;
  user_id: string;
  username: string | null;
  discriminator: string | null;
  guild_id: string;
  channel_id: string;
  channel_name: string | null;
  joined_at: Date;
  left_at: Date;
  duration_seconds: number;
  tracks_heard: number;
}

interface UserTrackListenEvent {
  user_session_id: string;
  user_id: string;
  guild_id: string;
  track_title: string;
  track_url: string | null;
  source_type: SourceType;
  duration: number | null;
  listened_at: Date;
  queued_by: string | null;
}

// User session buffers
const userSessionBuffer: UserSessionEvent[] = [];
const userTrackListenBuffer: UserTrackListenEvent[] = [];

// Active user sessions: keyed by `${guildId}:${channelId}:${userId}`
const activeUserSessions = new Map<string, ActiveUserSession>();

// ============================================================================
// INVASIVE TRACKING - New interfaces and buffers
// ============================================================================

type SkipReason = 'user_skip' | 'queue_clear' | 'bot_leave' | 'error' | 'next_track';
type InteractionType = 'button' | 'slash_command' | 'autocomplete' | 'context_menu' | 'modal';
type PlaybackStateType = 'volume' | 'pause' | 'resume' | 'seek' | 'loop_toggle' | 'shuffle';
type GuildEventType =
  | 'bot_added'
  | 'bot_removed'
  | 'member_joined'
  | 'member_left'
  | 'guild_updated';

// Track engagement - completion vs skip tracking
interface TrackEngagementEvent {
  engagement_id: string;
  track_title: string;
  track_url: string | null;
  guild_id: string;
  channel_id: string;
  source_type: SourceType;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  played_seconds: number | null;
  was_skipped: boolean;
  skipped_at_seconds: number | null;
  was_completed: boolean;
  skip_reason: SkipReason | null;
  queued_by: string | null;
  skipped_by: string | null;
  listeners_at_start: number;
  listeners_at_end: number;
}

// Active track engagement - in-memory while track is playing
interface ActiveTrackEngagement {
  engagementId: string;
  trackTitle: string;
  trackUrl: string | null;
  guildId: string;
  channelId: string;
  sourceType: SourceType;
  startedAt: Date;
  durationSeconds: number | null;
  queuedBy: string | null;
  listenersAtStart: number;
}

// Interaction events - button vs command tracking
interface InteractionEvent {
  interaction_type: InteractionType;
  interaction_id: string | null;
  custom_id: string | null;
  user_id: string;
  username: string | null;
  guild_id: string;
  channel_id: string | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

// Playback state changes - volume, pause, seek, etc.
interface PlaybackStateChangeEvent {
  guild_id: string;
  channel_id: string | null;
  state_type: PlaybackStateType;
  old_value: string | null;
  new_value: string | null;
  user_id: string | null;
  username: string | null;
  track_title: string | null;
  track_position_seconds: number | null;
  source: 'discord' | 'api';
  created_at: Date;
}

// Web events - dashboard tracking
interface WebEvent {
  web_session_id: string | null;
  user_id: string;
  event_type: string;
  event_target: string | null;
  event_value: string | null;
  guild_id: string | null;
  duration_ms: number | null;
  created_at: Date;
}

// Guild events - bot join/leave, member events
interface GuildEvent {
  event_type: GuildEventType;
  guild_id: string;
  guild_name: string | null;
  member_count: number | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

// API latency tracking
interface ApiLatencyEvent {
  endpoint: string;
  method: string;
  response_time_ms: number;
  status_code: number | null;
  user_id: string | null;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
  created_at: Date;
}

// New buffers for invasive tracking
const trackEngagementBuffer: TrackEngagementEvent[] = [];
const interactionEventBuffer: InteractionEvent[] = [];
const playbackStateChangeBuffer: PlaybackStateChangeEvent[] = [];
const webEventBuffer: WebEvent[] = [];
const guildEventBuffer: GuildEvent[] = [];
const apiLatencyBuffer: ApiLatencyEvent[] = [];

// Active track engagements: keyed by guildId
const activeTrackEngagements = new Map<string, ActiveTrackEngagement>();

const bufferMap: Record<BufferType, unknown[]> = {
  commands: commandBuffer,
  sounds: soundBuffer,
  queue: queueBuffer,
  voice: voiceBuffer,
  search: searchBuffer,
  userSessions: userSessionBuffer,
  userTrackListens: userTrackListenBuffer,
  trackEngagement: trackEngagementBuffer,
  interactionEvents: interactionEventBuffer,
  playbackStateChanges: playbackStateChangeBuffer,
  webEvents: webEventBuffer,
  guildEvents: guildEventBuffer,
  apiLatency: apiLatencyBuffer,
};

// Active voice sessions for tracking duration
const activeSessions = new Map<string, VoiceSessionEvent>();

let batchTimer: NodeJS.Timeout | null = null;

/**
 * Start batch processing timer
 */
function startBatchProcessor(): void {
  if (batchTimer) return;

  batchTimer = setInterval(async () => {
    await flushBatches();
  }, BATCH_INTERVAL);

  log.debug('Batch processor started');
}

/**
 * Flush all buffered events to database (parallel inserts)
 */
async function flushBatches(): Promise<void> {
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

  // Collect non-empty batches
  const insertPromises: Promise<void>[] = [];
  for (const { name, buffer, table } of batches) {
    if (buffer.length === 0) continue;

    const events = buffer.splice(0, BATCH_SIZE);
    insertPromises.push(insertBatch(name, table, events));
  }

  // Run all inserts in parallel
  if (insertPromises.length > 0) {
    await Promise.all(insertPromises);
  }
}

interface UserProfile {
  user_id: string;
  username: string | null;
  discriminator: string | null;
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
            `($${i * 18 + 1}, $${i * 18 + 2}, $${i * 18 + 3}, $${i * 18 + 4}, $${i * 18 + 5}, $${i * 18 + 6}, $${i * 18 + 7}, $${i * 18 + 8}, $${i * 18 + 9}, $${i * 18 + 10}, $${i * 18 + 11}, $${i * 18 + 12}, $${i * 18 + 13}, $${i * 18 + 14}, $${i * 18 + 15}, $${i * 18 + 16}, $${i * 18 + 17}, $${i * 18 + 18})`
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
        e.listeners_at_end,
      ]);

      await query(
        `INSERT INTO track_engagement (engagement_id, track_title, track_url, guild_id, channel_id, source_type, started_at, ended_at, duration_seconds, played_seconds, was_skipped, skipped_at_seconds, was_completed, skip_reason, queued_by, skipped_by, listeners_at_start, listeners_at_end) VALUES ${values}`,
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
      // Notify listeners that a batch was inserted
      // Provide type/table/count and timestamp
      (statsEmitter as EventEmitter).emit('batchInserted', {
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
    // Put events back in buffer to retry later (but limit buffer size)
    const buffer = bufferMap[type];
    if (buffer && buffer.length < BATCH_SIZE * 10) {
      buffer.unshift(...events);
    }
  }
}

/**
 * Classify error type from error message
 */
function classifyError(errorMessage: string | null): ErrorType {
  if (!errorMessage) return null;
  const msg = errorMessage.toLowerCase();

  if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('not allowed')) {
    return 'permission';
  }
  if (msg.includes('not found') || msg.includes('404') || msg.includes('does not exist')) {
    return 'not_found';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) {
    return 'rate_limit';
  }
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('abort')
  ) {
    return 'timeout';
  }
  if (
    msg.includes('invalid') ||
    msg.includes('missing') ||
    msg.includes('required') ||
    msg.includes('validation')
  ) {
    return 'validation';
  }
  if (
    msg.includes('youtube') ||
    msg.includes('spotify') ||
    msg.includes('soundcloud') ||
    msg.includes('api error') ||
    msg.includes('external')
  ) {
    return 'external_api';
  }
  return 'internal';
}

/**
 * Track a command execution
 */
export function trackCommand(
  commandName: string,
  userId: string,
  guildId: string,
  source: string = 'discord',
  success: boolean = true,
  errorMessage: string | null = null,
  username: string | null = null,
  discriminator: string | null = null,
  executionTimeMs: number | null = null
): void {
  if (!commandName || !userId || !guildId) {
    log.debug('Invalid command tracking data, skipping');
    return;
  }

  try {
    commandBuffer.push({
      command_name: commandName,
      user_id: userId,
      guild_id: guildId,
      username,
      discriminator,
      source: source === 'api' ? 'api' : 'discord',
      executed_at: new Date(),
      success,
      error_message: errorMessage,
      execution_time_ms: executionTimeMs,
      error_type: success ? null : classifyError(errorMessage),
    });

    // Flush if buffer is full
    if (commandBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking command: ${err.message}`);
  }
}

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
      source: source === 'api' ? 'api' : 'discord',
    });

    // Flush if buffer is full
    if (soundBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking sound: ${err.message}`);
  }
}

/**
 * Track queue operation
 */
export function trackQueueOperation(
  operationType: string,
  userId: string,
  guildId: string,
  source: string = 'discord',
  metadata: Record<string, unknown> | null = null
): void {
  if (!operationType || !userId || !guildId) {
    log.debug('Invalid queue operation tracking data, skipping');
    return;
  }

  try {
    queueBuffer.push({
      operation_type: operationType as OperationType,
      user_id: userId,
      guild_id: guildId,
      executed_at: new Date(),
      source: source === 'api' ? 'api' : 'discord',
      metadata,
    });

    // Flush if buffer is full
    if (queueBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking queue operation: ${err.message}`);
  }
}

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
      source: source === 'api' ? 'api' : 'discord',
    });

    // Flush if buffer is full
    if (voiceBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking voice event: ${err.message}`);
  }
}

/**
 * Track a search query
 */
export function trackSearch(
  userId: string,
  guildId: string,
  queryText: string,
  queryType: 'search' | 'url' | 'playlist' | 'soundboard',
  resultsCount: number | null = null,
  selectedIndex: number | null = null,
  selectedTitle: string | null = null,
  source: string = 'discord'
): void {
  if (!userId || !guildId || !queryText) {
    log.debug('Invalid search tracking data, skipping');
    return;
  }

  try {
    searchBuffer.push({
      user_id: userId,
      guild_id: guildId,
      query: queryText,
      query_type: queryType,
      results_count: resultsCount,
      selected_index: selectedIndex,
      selected_title: selectedTitle,
      searched_at: new Date(),
      source: source === 'api' ? 'api' : 'discord',
    });

    if (searchBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking search: ${err.message}`);
  }
}

/**
 * Start a voice session (called when bot joins voice)
 */
export function startVoiceSession(
  guildId: string,
  channelId: string,
  channelName: string | null = null,
  source: string = 'discord'
): string {
  const sessionId = randomUUID();

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
    source: source === 'api' ? 'api' : 'discord',
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

/**
 * Flush all pending events (useful for graceful shutdown)
 */
export async function flushAll(): Promise<void> {
  // End all active user sessions first
  for (const [key, session] of activeUserSessions) {
    const parts = key.split(':');
    const guildId = parts[0] || '';
    const channelId = parts[1] || '';
    await endUserSession(session.userId, guildId, channelId);
  }

  // End all active bot sessions
  for (const guildId of activeSessions.keys()) {
    await endVoiceSession(guildId);
  }

  await flushBatches();
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
  try {
    statsEmitter.emit('flushed', { ts: new Date().toISOString() });
  } catch {
    /* ignore */
  }
}

// ============================================================================
// USER SESSION TRACKING
// ============================================================================

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
  const key = `${guildId}:${channelId}:${userId}`;

  // Don't create duplicate sessions
  if (activeUserSessions.has(key)) {
    return activeUserSessions.get(key)!.sessionId;
  }

  const sessionId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const botSession = activeSessions.get(guildId);

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

  // Update peak users for bot session
  updatePeakUsersForGuild(guildId, channelId);

  return sessionId;
}

/**
 * End a user's voice session when they leave the bot's channel
 */
export async function endUserSession(
  userId: string,
  guildId: string,
  channelId: string
): Promise<void> {
  const key = `${guildId}:${channelId}:${userId}`;
  const session = activeUserSessions.get(key);

  if (!session) {
    log.debug(`No active user session found for user ${userId} in guild ${guildId}`);
    return;
  }

  const leftAt = new Date();
  const durationSeconds = Math.floor((leftAt.getTime() - session.joinedAt.getTime()) / 1000);

  // Add to buffer for batch processing
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

  // Trigger flush if buffer is full
  if (userSessionBuffer.length >= BATCH_SIZE) {
    await flushBatches();
  }

  startBatchProcessor();
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
  // Find all active user sessions in this channel
  const usersInChannel = getUsersInChannel(guildId, channelId);

  for (const session of usersInChannel) {
    // Avoid duplicate tracking for the same track in same session
    if (session.trackTitles.includes(trackTitle)) continue;

    session.tracksHeard++;
    session.trackTitles.push(trackTitle);

    // Add to buffer for batch processing
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

  // Trigger flush if buffer is full
  if (userTrackListenBuffer.length >= BATCH_SIZE) {
    flushBatches().catch((err) => log.error(`Error flushing batches: ${err.message}`));
  }

  startBatchProcessor();
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
 * Update peak user count for a guild's bot session
 */
function updatePeakUsersForGuild(guildId: string, channelId: string): void {
  const botSession = activeSessions.get(guildId);
  if (!botSession) return;

  // Count users in the channel
  const userCount = getUsersInChannel(guildId, channelId).length;

  // Call existing function to update peak
  updateSessionPeakUsers(guildId, userCount);
}

/**
 * End all user sessions for a guild (called when bot leaves)
 */
export async function endAllUserSessionsForGuild(guildId: string): Promise<void> {
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

// ============================================================================
// INVASIVE TRACKING - Track Engagement (completion vs skip)
// ============================================================================

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
  const engagementId = `${guildId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const listenersAtStart = getActiveUserCount(guildId, channelId);

  const engagement: ActiveTrackEngagement = {
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
    actualPlayedSeconds >= engagement.durationSeconds * 0.9; // 90% = completed

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
}

/**
 * Get active track engagement for a guild
 */
export function getActiveTrackEngagement(guildId: string): ActiveTrackEngagement | undefined {
  return activeTrackEngagements.get(guildId);
}

// ============================================================================
// INVASIVE TRACKING - Interaction Events (button vs command)
// ============================================================================

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
}

// ============================================================================
// INVASIVE TRACKING - Playback State Changes
// ============================================================================

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
}

// ============================================================================
// INVASIVE TRACKING - Web Events
// ============================================================================

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
}

// ============================================================================
// INVASIVE TRACKING - Guild Events
// ============================================================================

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
}

// ============================================================================
// INVASIVE TRACKING - API Latency
// ============================================================================

/**
 * Track API endpoint latency
 */
export function trackApiLatency(
  endpoint: string,
  method: string,
  responseTimeMs: number,
  statusCode: number | null = null,
  userId: string | null = null,
  requestSizeBytes: number | null = null,
  responseSizeBytes: number | null = null
): void {
  apiLatencyBuffer.push({
    endpoint,
    method,
    response_time_ms: responseTimeMs,
    status_code: statusCode,
    user_id: userId,
    request_size_bytes: requestSizeBytes,
    response_size_bytes: responseSizeBytes,
    created_at: new Date(),
  });

  log.debug(`Tracked API latency: ${method} ${endpoint} - ${responseTimeMs}ms`);
  startBatchProcessor();
}
