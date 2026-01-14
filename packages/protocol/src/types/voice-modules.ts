/**
 * Type definitions for voice module system
 */
import type { VoiceConnection, AudioPlayer, AudioResource } from '@discordjs/voice';
import type { Track } from './voice';

export interface VoiceState {
  connection: VoiceConnection;
  player: AudioPlayer;

  /** Playback state */
  nowPlaying: string | null;
  currentTrack: Track | null;
  currentResource: AudioResource | null;

  /** Queue */
  queue: Track[];

  /** Channel */
  channelId: string;
  channelName: string;

  /** Attribution */
  lastUserId: string | null;
  lastUsername: string | null;
  lastDiscriminator: string | null;

  /** Timing */
  playbackStartTime: number | null;
  pauseStartTime: number | null;
  totalPausedTime: number;

  /** Volume (music only) */
  volume: number;

  /** Legacy snapshot for paused music */
  pausedMusic?: unknown | null;

  /** Process / overlay (soundboard only) */
  overlayProcess: unknown | null;

  /** Replay support */
  lastPlayedTrack: Track | null;

  /** Guards */
  isTransitioningToOverlay: boolean;
  autoplay: boolean;
  wasManuallySkipped: boolean;

  /** Internal bookkeeping */
  currentTrackSource: string | null;
  preBuffered: unknown | null;
}

export interface StreamUrlCache {
  url: string;
  expires: number;
}

export interface ConnectionManagerInterface {
  joinChannel(channel: unknown): Promise<{ connection: VoiceConnection; player: AudioPlayer }>;
  leaveChannel(guildId: string): boolean;
  getVoiceState(guildId: string): VoiceState | undefined;
  getAllConnections(): unknown[];
}

export interface QueueManagerInterface {
  addToQueue(guildId: string, tracks: Track[]): Promise<{ added: number; tracks: Track[] }>;
  skip(guildId: string, count: number): Promise<string[]>;
  clearQueue(guildId: string): Promise<number>;
  removeTrackFromQueue(guildId: string, index: number): Promise<Track>;
  getQueue(guildId: string): unknown;
  restoreQueue(guildId: string, tracks: Track[]): Promise<void>;
}

export interface PlaybackManagerInterface {
  playNext(guildId: string): Promise<Track | null>;
  togglePause(guildId: string): { paused: boolean };
  stopSound(guildId: string): boolean;
  setVolume(guildId: string, level: number): number;
  playSoundImmediate(guildId: string, resource: AudioResource, title: string): void;
  playSoundboardOverlay(guildId: string, soundName: string): Promise<unknown>;
}

export interface TrackFetcherInterface {
  fetchTracks(source: string, guildId: string): Promise<Track[]>;
}

export interface SnapshotPersistenceInterface {
  saveQueueSnapshot(guildId: string): Promise<void>;
  saveAllQueueSnapshots(): Promise<void>;
  restoreQueueSnapshot(guildId: string, client: unknown): Promise<boolean>;
  restoreAllQueueSnapshots(client: unknown): Promise<number>;
}
