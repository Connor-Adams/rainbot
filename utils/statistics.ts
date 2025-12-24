import { query } from './database';
import { createLogger } from './logger';
import type { SourceType } from './sourceType';

const log = createLogger('STATS');

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

type BufferType = 'commands' | 'sounds' | 'queue' | 'voice' | 'search';

const bufferMap: Record<BufferType, unknown[]> = {
  commands: commandBuffer,
  sounds: soundBuffer,
  queue: queueBuffer,
  voice: voiceBuffer,
  search: searchBuffer,
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
    }

    log.debug(`Inserted ${events.length} ${type} events`);
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
  // End all active sessions
  for (const guildId of activeSessions.keys()) {
    await endVoiceSession(guildId);
  }

  await flushBatches();
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}
