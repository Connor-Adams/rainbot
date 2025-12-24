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
import type { VoiceState } from '../../types/voice-modules';
import type { Track } from '../../types/voice';

const log = createLogger('CONNECTION');

/** Map of guildId -> voice state */
export const voiceStates = new Map<string, VoiceState>();

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
  };

  voiceStates.set(guildId, state);

  log.info(`Joined voice channel: ${channel.name} (${channel.guild.name})`);
  return { connection, player };
}

/**
 * Leave a voice channel
 */
export function leaveChannel(guildId: string): boolean {
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
