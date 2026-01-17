import type { SourceType } from '../sourceType';

export type Source = 'discord' | 'api';
export type OperationType = 'skip' | 'pause' | 'resume' | 'clear' | 'remove' | 'replay';
export type VoiceEventType = 'join' | 'leave';
export type ErrorType =
  | 'validation'
  | 'permission'
  | 'not_found'
  | 'rate_limit'
  | 'external_api'
  | 'internal'
  | 'timeout'
  | null;
export type QueryType = 'search' | 'url' | 'playlist' | 'soundboard';
export type BufferType =
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

export interface CommandEvent {
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

export interface SoundEvent {
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

export interface SearchEvent {
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

export interface VoiceSessionEvent {
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

export interface QueueEvent {
  operation_type: OperationType;
  user_id: string;
  guild_id: string;
  executed_at: Date;
  source: Source;
  metadata: Record<string, unknown> | null;
}

export interface VoiceEvent {
  event_type: VoiceEventType;
  guild_id: string;
  channel_id: string;
  channel_name: string | null;
  executed_at: Date;
  source: Source;
}

export interface ActiveUserSession {
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

export interface UserSessionEvent {
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

export interface UserTrackListenEvent {
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

export type SkipReason = 'user_skip' | 'queue_clear' | 'bot_leave' | 'error' | 'next_track';
export type InteractionType =
  | 'button'
  | 'slash_command'
  | 'autocomplete'
  | 'context_menu'
  | 'modal';
export type PlaybackStateType = 'volume' | 'pause' | 'resume' | 'seek' | 'loop_toggle' | 'shuffle';
export type GuildEventType =
  | 'bot_added'
  | 'bot_removed'
  | 'member_joined'
  | 'member_left'
  | 'guild_updated';

export interface TrackEngagementEvent {
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

export interface ActiveTrackEngagement {
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

export interface InteractionEvent {
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

export interface PlaybackStateChangeEvent {
  guild_id: string;
  channel_id: string | null;
  state_type: PlaybackStateType;
  old_value: string | null;
  new_value: string | null;
  user_id: string | null;
  username: string | null;
  track_title: string | null;
  track_position_seconds: number | null;
  source: Source;
  created_at: Date;
}

export interface WebEvent {
  web_session_id: string | null;
  user_id: string;
  event_type: string;
  event_target: string | null;
  event_value: string | null;
  guild_id: string | null;
  duration_ms: number | null;
  created_at: Date;
}

export interface GuildEvent {
  event_type: GuildEventType;
  guild_id: string;
  guild_name: string | null;
  member_count: number | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface ApiLatencyEvent {
  endpoint: string;
  method: string;
  response_time_ms: number;
  status_code: number | null;
  user_id: string | null;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
  created_at: Date;
}

export interface UserProfile {
  user_id: string;
  username: string | null;
  discriminator: string | null;
}
