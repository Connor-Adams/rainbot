import { createAudioResource, AudioPlayerStatus, StreamType } from '@discordjs/voice';
import type { VoiceBasedChannel, Client } from 'discord.js';

// Import split modules
import * as connectionManager from './voice/connectionManager';
import * as queueManager from './voice/queueManager';
import * as playbackManager from './voice/playbackManager';
import * as trackFetcher from './voice/trackFetcher';
import * as snapshotPersistence from './voice/snapshotPersistence';

import { createLogger } from './logger';
import * as stats from './statistics';
import * as storage from './storage';
import * as listeningHistory from './listeningHistory';
import type { Track, QueueInfo, VoiceStatus } from '../types/voice';

const log = createLogger('VOICE');

// Re-export getVoiceState for other modules
export const getVoiceState = connectionManager.getVoiceState;

/**
 * Track soundboard usage in statistics and listening history
 */
function trackSoundboardUsage(
  soundName: string,
  userId: string,
  guildId: string,
  source: string,
  username: string | null = null,
  discriminator: string | null = null
): void {
  if (!userId) return;

  stats.trackSound(
    soundName,
    userId,
    guildId,
    'local',
    true, // isSoundboard
    null, // duration
    source,
    username,
    discriminator
  );

  listeningHistory
    .trackPlayed(
      userId,
      guildId,
      {
        title: soundName,
        url: undefined,
        duration: undefined,
        isLocal: true,
        source,
        isSoundboard: true,
      },
      userId
    )
    .catch((err) => log.error(`Failed to track soundboard history: ${(err as Error).message}`));
}

// ============================================================================
// PUBLIC API - DELEGATES TO MODULES
// ============================================================================

/**
 * Join a voice channel
 */
export async function joinChannel(
  channel: VoiceBasedChannel
): ReturnType<typeof connectionManager.joinChannel> {
  const result = await connectionManager.joinChannel(channel);

  // Track voice join event
  stats.trackVoiceEvent('join', channel.guild.id, channel.id, channel.name, 'discord');

  return result;
}

/**
 * Leave a voice channel
 */
export function leaveChannel(guildId: string): boolean {
  const state = connectionManager.getVoiceState(guildId);

  // Save queue snapshot if there's content to preserve
  if (state && (state.currentTrack || state.queue.length > 0)) {
    snapshotPersistence
      .saveQueueSnapshot(guildId)
      .catch((e) => log.error(`Failed to save queue snapshot on leave: ${(e as Error).message}`));
  }

  // Save history before leaving
  if (state && state.lastUserId) {
    const queueInfo = getQueue(guildId);
    listeningHistory.saveHistory(
      state.lastUserId,
      guildId,
      queueInfo.queue,
      queueInfo.nowPlaying,
      queueInfo.currentTrack || null
    );
  }

  const channelId = state?.channelId || null;
  const channelName = state?.channelName || null;

  const result = connectionManager.leaveChannel(guildId);

  // Track voice leave event
  if (result && channelId) {
    stats.trackVoiceEvent('leave', guildId, channelId, channelName, 'discord');
  }

  return result;
}

export interface PlayResult {
  added: number;
  tracks: Array<{ title: string; isLocal?: boolean }>;
  totalInQueue: number;
  overlaid?: boolean;
}

/**
 * Play a soundboard sound overlaid on current music
 */
export async function playSoundboardOverlay(
  guildId: string,
  soundName: string,
  userId: string | null = null,
  source: string = 'discord',
  username: string | null = null,
  discriminator: string | null = null
): Promise<{ overlaid: boolean; sound: string; message: string }> {
  const result = await playbackManager.playSoundboardOverlay(guildId, soundName);

  // Track soundboard usage
  const state = connectionManager.getVoiceState(guildId);
  const trackUserId = userId || state?.lastUserId;
  const trackUsername = username || state?.lastUsername;
  const trackDiscriminator = discriminator || state?.lastDiscriminator;

  if (trackUserId) {
    trackSoundboardUsage(
      soundName,
      trackUserId,
      guildId,
      source,
      trackUsername,
      trackDiscriminator
    );
  }

  return result;
}

/**
 * Add track(s) to queue and start playing if not already
 */
export async function playSound(
  guildId: string,
  source: string,
  userId: string | null = null,
  requestSource: string = 'discord',
  username: string | null = null,
  discriminator: string | null = null
): Promise<PlayResult> {
  const startTime = Date.now();
  const state = connectionManager.getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel in this server');
  }

  if (!source || typeof source !== 'string') {
    throw new Error('Invalid source provided');
  }

  log.debug(`[TIMING] playSound started`);

  // Fetch tracks using trackFetcher module
  const tracks = await trackFetcher.fetchTracks(source, guildId);

  // Handle soundboard files specially (they play immediately)
  const firstTrack = tracks[0];
  if (tracks.length === 1 && firstTrack && firstTrack.isLocal && firstTrack.isSoundboard) {
    const track = firstTrack;
    const hasMusicSource = state.currentTrackSource;

    if (hasMusicSource) {
      // Overlay soundboard on music
      log.info(`Soundboard file detected, playing immediately over music: ${source}`);
      try {
        const overlayResult = await playSoundboardOverlay(
          guildId,
          source,
          userId,
          requestSource,
          username,
          discriminator
        );

        return {
          added: 1,
          tracks: [{ title: track.title, isLocal: true }],
          totalInQueue: state.queue.length,
          overlaid: overlayResult.overlaid,
        };
      } catch (overlayError) {
        log.warn(`Overlay failed, playing soundboard directly: ${(overlayError as Error).message}`);
        // Fallback handled by playbackManager
        const soundStream = await storage.getSoundStream(source);
        const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });

        playbackManager.playSoundImmediate(guildId, resource, track.title);

        if (userId) {
          trackSoundboardUsage(source, userId, guildId, requestSource, username, discriminator);
        }

        return {
          added: 1,
          tracks: [{ title: track.title, isLocal: true }],
          totalInQueue: state.queue.length,
          overlaid: false,
        };
      }
    } else {
      // No music - play soundboard directly
      log.info(`Soundboard file detected, playing immediately (no music): ${source}`);
      const soundStream = await storage.getSoundStream(source);
      const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });

      playbackManager.playSoundImmediate(guildId, resource, track.title);

      if (userId) {
        trackSoundboardUsage(source, userId, guildId, requestSource, username, discriminator);
      }

      return {
        added: 1,
        tracks: [{ title: track.title, isLocal: true }],
        totalInQueue: state.queue.length,
        overlaid: false,
      };
    }
  }

  // Store userId for history tracking and statistics
  if (userId) {
    state.lastUserId = userId;
    if (username) {
      state.lastUsername = username;
    }
    if (discriminator) {
      state.lastDiscriminator = discriminator;
    }
  }

  // Store userId and source with each track
  tracks.forEach((track) => {
    if (!track.userId && userId) {
      track.userId = userId;
    }
    if (!track.username && username) {
      track.username = username;
    }
    if (!track.discriminator && discriminator) {
      track.discriminator = discriminator;
    }
    if (!track.source) {
      track.source = requestSource;
    }
  });

  // Add tracks to queue using queueManager
  const result = await queueManager.addToQueue(guildId, tracks);

  log.debug(`[TIMING] Tracks queued (${Date.now() - startTime}ms)`);

  // Start playing if not already
  const isPlaying = state.player.state.status === AudioPlayerStatus.Playing;
  if (!isPlaying) {
    log.debug(`[TIMING] Calling playNext (${Date.now() - startTime}ms)`);
    await playbackManager.playNext(guildId);
    log.debug(`[TIMING] playNext returned (${Date.now() - startTime}ms)`);
  }

  // Save history for user
  if (userId) {
    const queueInfo = getQueue(guildId);
    listeningHistory.saveHistory(
      userId,
      guildId,
      queueInfo.queue,
      queueInfo.nowPlaying,
      state.currentTrack
    );
  }

  return {
    added: result.added,
    tracks: result.tracks.slice(0, 5),
    totalInQueue: state.queue.length,
  };
}

/**
 * Skip current track(s)
 */
export async function skip(guildId: string, count: number = 1): Promise<string[]> {
  const result = await queueManager.skip(guildId, count);

  // Track skip operation
  const state = connectionManager.getVoiceState(guildId);
  if (state?.lastUserId) {
    stats.trackQueueOperation('skip', state.lastUserId, guildId, 'discord', {
      count,
      skipped: result.length,
    });
  }

  return result;
}

/**
 * Pause/resume playback
 */
export function togglePause(guildId: string): { paused: boolean } {
  const result = playbackManager.togglePause(guildId);

  // Track pause/resume operation
  const state = connectionManager.getVoiceState(guildId);
  if (state?.lastUserId) {
    const operation = result.paused ? 'pause' : 'resume';
    stats.trackQueueOperation(operation, state.lastUserId, guildId, 'discord');
  }

  return result;
}

/**
 * Get the current queue with stateful information
 */
export function getQueue(guildId: string): QueueInfo {
  return queueManager.getQueue(guildId);
}

/**
 * Clear the queue
 */
export async function clearQueue(guildId: string): Promise<number> {
  const cleared = await queueManager.clearQueue(guildId);

  // Track queue clear operation
  const state = connectionManager.getVoiceState(guildId);
  if (state?.lastUserId) {
    stats.trackQueueOperation('clear', state.lastUserId, guildId, 'discord', { cleared });
  }

  return cleared;
}

/**
 * Remove a track from the queue by index
 */
export async function removeTrackFromQueue(guildId: string, index: number): Promise<Track> {
  const removed = await queueManager.removeTrackFromQueue(guildId, index);

  // Track removal operation
  const state = connectionManager.getVoiceState(guildId);
  if (state?.lastUserId) {
    stats.trackQueueOperation('remove', state.lastUserId, guildId, 'discord', {
      index,
      track: removed.title,
    });
  }

  return removed;
}

/**
 * Stop current playback and clear queue
 */
export function stopSound(guildId: string): boolean {
  const state = connectionManager.getVoiceState(guildId);

  // Save history before stopping
  if (state?.lastUserId) {
    const queueInfo = getQueue(guildId);
    listeningHistory.saveHistory(
      state.lastUserId,
      guildId,
      queueInfo.queue,
      queueInfo.nowPlaying,
      queueInfo.currentTrack || null
    );
  }

  return playbackManager.stopSound(guildId);
}

/**
 * Get status for a guild
 */
export function getStatus(guildId: string): VoiceStatus | null {
  const state = connectionManager.getVoiceState(guildId);
  if (!state) {
    return null;
  }

  return {
    channelId: state.channelId,
    channelName: state.channelName,
    nowPlaying: state.nowPlaying,
    isPlaying: state.player.state.status === AudioPlayerStatus.Playing,
    queueLength: state.queue.length,
  };
}

/**
 * Set volume for a guild (1-100)
 */
export function setVolume(guildId: string, level: number): number {
  return playbackManager.setVolume(guildId, level);
}

/**
 * Get all active voice connections
 */
export function getAllConnections(): connectionManager.ConnectionInfo[] {
  return connectionManager.getAllConnections();
}

/**
 * List all available sounds
 */
export async function listSounds(): Promise<storage.SoundFile[]> {
  return await storage.listSounds();
}

/**
 * Delete a sound file
 */
export async function deleteSound(filename: string): Promise<boolean> {
  return await storage.deleteSound(filename);
}

/**
 * Resume listening history for a user
 */
export async function resumeHistory(
  guildId: string,
  userId: string
): Promise<{ restored: number; nowPlaying: string | null }> {
  const state = connectionManager.getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  // Try to get from database first, fall back to in-memory
  let history = await listeningHistory.getRecentHistory(userId, guildId);
  if (!history) {
    history = listeningHistory.getHistory(userId);
  }
  if (!history || history.queue.length === 0) {
    throw new Error('No listening history found');
  }

  // Restore queue using queueManager - map history tracks to voice tracks
  const voiceTracks = history.queue
    .filter((t): t is listeningHistory.Track & { title: string } => !!t.title)
    .map((t) => ({
      title: t.title,
      url: t.url,
      duration: t.duration,
      isLocal: t.isLocal,
    }));
  await queueManager.restoreQueue(guildId, voiceTracks);
  state.lastUserId = userId;

  // Start playing if not already
  const isPlaying = state.player.state.status === AudioPlayerStatus.Playing;
  if (!isPlaying && state.queue.length > 0) {
    playbackManager.playNext(guildId).catch((err) => {
      log.error(`Failed to resume playback: ${(err as Error).message}`);
    });
  }

  log.info(`Resumed history for user ${userId}: ${history.queue.length} tracks`);

  return {
    restored: history.queue.length,
    nowPlaying: history.nowPlaying,
  };
}

/**
 * Save queue snapshot to database for persistence across restarts
 */
export async function saveQueueSnapshot(guildId: string): Promise<void> {
  return snapshotPersistence.saveQueueSnapshot(guildId);
}

/**
 * Save all active queue snapshots (for graceful shutdown)
 */
export async function saveAllQueueSnapshots(): Promise<void> {
  return snapshotPersistence.saveAllQueueSnapshots();
}

/**
 * Restore queue snapshot from database
 */
export async function restoreQueueSnapshot(guildId: string, client: Client): Promise<boolean> {
  return snapshotPersistence.restoreQueueSnapshot(guildId, client);
}

/**
 * Restore all queue snapshots (called on bot startup)
 */
export async function restoreAllQueueSnapshots(client: Client): Promise<number> {
  return snapshotPersistence.restoreAllQueueSnapshots(client);
}
