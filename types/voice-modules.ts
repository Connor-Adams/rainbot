/**
 * Type definitions for voice module system
 */
import type { VoiceConnection, AudioPlayer, AudioResource } from '@discordjs/voice';
import type { Track } from './voice';

export interface VoiceState {
  connection: VoiceConnection;
  player: AudioPlayer;
  nowPlaying: string | null;
  currentTrack: Track | null;
  currentResource: AudioResource | null;
  queue: Track[];
  channelId: string;
  channelName: string;
  lastUserId: string | null;
  lastUsername: string | null;
  lastDiscriminator: string | null;
  pausedMusic: unknown | null;
  playbackStartTime: number | null;
  pauseStartTime: number | null;
  totalPausedTime: number;
  overlayProcess: unknown | null;
  volume: number;
  preBuffered: unknown | null;
  currentTrackSource: string | null;
  lastPlayedTrack: Track | null; // For replay functionality (not soundboard)
  isTransitioningToOverlay: boolean; // Flag to prevent idle handler from playing next during overlay transition
  autoplay: boolean; // Auto keep playing mode - automatically adds related tracks when queue is empty
  wasManuallySkipped: boolean; // Flag to prevent double-tracking stats when skip is called
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
