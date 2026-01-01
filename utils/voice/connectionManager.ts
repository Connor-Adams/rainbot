/**
 * Connection Manager - Handles voice connections and state
 */
import {
  joinVoiceChannel,
  createAudioPlayer,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  getVoiceConnection,
  VoiceConnection,
  AudioPlayer,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import { createLogger } from '../logger';
import * as stats from '../statistics';
import type { VoiceState } from '../../types/voice-modules';
import type { Track } from '../../types/voice';

const log = createLogger('CONNECTION');

/** Map of guildId -> voice state */
export const voiceStates = new Map<string, VoiceState>();

/**
 * Create an autoplay track with proper metadata
 */
function createAutoplayTrack(relatedTrack: Track, state: VoiceState): Track {
  return {
    ...relatedTrack,
    userId: state.lastUserId || undefined,
    username: state.lastUsername || undefined,
    discriminator: state.lastDiscriminator || undefined,
    source: 'autoplay',
  };
}

/**
 * Join a voice channel
 */
export async function joinChannel(
  channel: VoiceBasedChannel
): Promise<{ connection: VoiceConnection; player: AudioPlayer }> {
  const guildId = channel.guild.id;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  // Handle when audio finishes playing
  player.on(AudioPlayerStatus.Idle, async () => {
    try {
      const state = voiceStates.get(guildId);
      if (!state) return;

      // If we're transitioning to a soundboard overlay, don't advance the queue
      if (state.isTransitioningToOverlay === true) {
        log.debug('Ignoring idle event - transitioning to soundboard overlay');
        return;
      }

      // Check if an overlay just finished (not a regular track)
      if (state.overlayProcess) {
        log.debug('Overlay finished - music track completed through overlay');
        state.overlayProcess = null;
        // The overlay already played the music through to completion, so just continue with queue
      }

      // End track engagement - track completed naturally
      stats.endTrackEngagement(guildId, false, 'next_track', null, null);

      // Check if there's more in queue
      if (state.queue.length > 0) {
        log.debug(`Track finished, playing next in queue (${state.queue.length} remaining)`);
        // Dynamic import to avoid circular dependency
        const { playNext } = await import('./playbackManager');
        await playNext(guildId);
      } else {
        // Queue empty - check if autoplay is enabled
        if (state.autoplay && state.lastPlayedTrack && !state.lastPlayedTrack.isSoundboard) {
          log.info(`Queue empty, autoplay enabled - finding related track`);
          try {
            const { getRelatedTrack } = await import('./trackFetcher');
            const relatedTrack = await getRelatedTrack(state.lastPlayedTrack);

            if (relatedTrack) {
              // Add user info from last track using factory function
              const autoplayTrack = createAutoplayTrack(relatedTrack, state);

              // Mutate the queue under the queue lock to avoid race conditions
              const { withQueueLock } = await import('./queueManager');
              await withQueueLock(guildId, () => {
                state.queue.push(autoplayTrack);
              });
              log.info(`Added autoplay track: "${autoplayTrack.title}"`);

              const { playNext } = await import('./playbackManager');
              await playNext(guildId);
            } else {
              log.debug(`No related track found, clearing now playing state`);
              state.nowPlaying = null;
              state.currentTrack = null;
              state.currentResource = null;
              state.currentTrackSource = null;
              state.playbackStartTime = null;
            }
          } catch (error) {
            const err = error as Error;
            log.error(`Autoplay failed: ${err.message}`);
            // Clear now playing on error
            state.nowPlaying = null;
            state.currentTrack = null;
            state.currentResource = null;
            state.currentTrackSource = null;
            state.playbackStartTime = null;
          }
        } else {
          // Autoplay disabled or no suitable last track - clear now playing
          log.debug(`Queue empty, clearing now playing state`);
          state.nowPlaying = null;
          state.currentTrack = null;
          state.currentResource = null;
          state.currentTrackSource = null;
          state.playbackStartTime = null;
        }
      }
    } catch (error) {
      const err = error as Error;
      log.error(`Error in Idle event handler for guild ${guildId}: ${err.message}`);
      log.error(`Stack trace: ${err.stack}`);
      // Try to continue with next track anyway if queue has items
      const state = voiceStates.get(guildId);
      if (state && state.queue.length > 0) {
        log.info(`Attempting to recover by playing next track for guild ${guildId}...`);
        try {
          const { playNext } = await import('./playbackManager');
          await playNext(guildId);
        } catch (retryError) {
          const retryErr = retryError as Error;
          log.error(`Failed to recover for guild ${guildId}: ${retryErr.message}`);
        }
      }
    }
  });

  // Handle connection state changes
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      log.debug(`Reconnecting to voice in guild ${guildId}`);
    } catch {
      log.info(`Disconnected from voice in guild ${guildId}`);
      connection.destroy();
      voiceStates.delete(guildId);
    }
  });

  const state: VoiceState = {
    connection,
    player,
    nowPlaying: null,
    currentTrack: null,
    currentResource: null,
    queue: [] as Track[],
    channelId: channel.id,
    channelName: channel.name,
    lastUserId: null,
    lastUsername: null,
    lastDiscriminator: null,
    pausedMusic: null,
    playbackStartTime: null,
    pauseStartTime: null,
    totalPausedTime: 0,
    overlayProcess: null,
    volume: 100,
    preBuffered: null,
    currentTrackSource: null,
    lastPlayedTrack: null,
    isTransitioningToOverlay: false,
    autoplay: false,
  };

  voiceStates.set(guildId, state);

  log.info(`Joined voice channel: ${channel.name} (${channel.guild.name})`);
  return { connection, player };
}

/**
 * Leave a voice channel
 */
export function leaveChannel(guildId: string): boolean {
  const state = voiceStates.get(guildId);

  // End track engagement if something was playing - bot is leaving
  if (state?.nowPlaying) {
    stats.endTrackEngagement(guildId, true, 'bot_leave', null, null);
  }

  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    voiceStates.delete(guildId);
    log.info(`Left voice channel in guild ${guildId}`);
    return true;
  }
  return false;
}

/**
 * Get voice state for a guild
 */
export function getVoiceState(guildId: string): VoiceState | undefined {
  return voiceStates.get(guildId);
}

export interface ConnectionInfo {
  guildId: string;
  channelId: string;
  channelName: string;
  nowPlaying: string | null;
  isPlaying: boolean;
  queueLength: number;
  volume: number;
}

/**
 * Get all active voice connections
 */
export function getAllConnections(): ConnectionInfo[] {
  const connections: ConnectionInfo[] = [];
  for (const [guildId, state] of voiceStates) {
    connections.push({
      guildId,
      channelId: state.channelId,
      channelName: state.channelName,
      nowPlaying: state.nowPlaying,
      isPlaying: state.player.state.status === AudioPlayerStatus.Playing,
      queueLength: state.queue.length,
      volume: state.volume || 100,
    });
  }
  return connections;
}
