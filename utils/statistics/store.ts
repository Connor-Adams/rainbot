import type {
  ActiveTrackEngagement,
  ActiveUserSession,
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
  UserSessionEvent,
  UserTrackListenEvent,
  VoiceEvent,
  VoiceSessionEvent,
  WebEvent,
} from './types';

// Event buffers for batch processing
export const commandBuffer: CommandEvent[] = [];
export const soundBuffer: SoundEvent[] = [];
export const queueBuffer: QueueEvent[] = [];
export const voiceBuffer: VoiceEvent[] = [];
export const searchBuffer: SearchEvent[] = [];
export const userSessionBuffer: UserSessionEvent[] = [];
export const userTrackListenBuffer: UserTrackListenEvent[] = [];
export const trackEngagementBuffer: TrackEngagementEvent[] = [];
export const interactionEventBuffer: InteractionEvent[] = [];
export const playbackStateChangeBuffer: PlaybackStateChangeEvent[] = [];
export const webEventBuffer: WebEvent[] = [];
export const guildEventBuffer: GuildEvent[] = [];
export const apiLatencyBuffer: ApiLatencyEvent[] = [];

// Active voice sessions for tracking duration
export const activeSessions = new Map<string, VoiceSessionEvent>();

// Active user sessions: keyed by `${guildId}:${channelId}:${userId}`
export const activeUserSessions = new Map<string, ActiveUserSession>();

// Active track engagements: keyed by guildId
export const activeTrackEngagements = new Map<string, ActiveTrackEngagement>();

export const bufferMap: Record<BufferType, unknown[]> = {
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
