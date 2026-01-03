/**
 * TTS Player - Dedicated audio player for text-to-speech responses
 * Completely separate from music/soundboard playback
 */
import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnection,
  AudioPlayer,
} from '@discordjs/voice';
import { createReadStream } from 'fs';
import { createLogger } from '../logger';

const log = createLogger('TTS_PLAYER');

/** Map of guildId -> TTS audio player */
const ttsPlayers = new Map<string, AudioPlayer>();

/**
 * Get or create a dedicated TTS player for a guild
 */
function getTTSPlayer(guildId: string, connection: VoiceConnection): AudioPlayer {
  let player = ttsPlayers.get(guildId);

  if (!player) {
    player = createAudioPlayer();

    // Handle player events
    player.on('error', (error) => {
      log.error(`TTS player error in guild ${guildId}: ${error.message}`);
    });

    player.on(AudioPlayerStatus.Playing, () => {
      log.debug(`TTS player started in guild ${guildId}`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      log.debug(`TTS player finished in guild ${guildId}`);
    });

    // Subscribe the connection to this player
    // Note: A connection can have multiple subscriptions (one for music, one for TTS)
    connection.subscribe(player);

    ttsPlayers.set(guildId, player);
    log.debug(`Created dedicated TTS player for guild ${guildId}`);
  }

  return player;
}

/**
 * Play TTS audio in a voice channel
 * Uses a separate audio player that doesn't interfere with music/soundboard
 */
export async function playTTSAudio(
  guildId: string,
  connection: VoiceConnection,
  audioFilePath: string
): Promise<void> {
  try {
    const player = getTTSPlayer(guildId, connection);

    // Create audio resource from the TTS file
    const resource = createAudioResource(createReadStream(audioFilePath), {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });

    // Set TTS volume (slightly lower than music to not overpower)
    if (resource.volume) {
      resource.volume.setVolume(0.7);
    }

    // Play the TTS audio
    player.play(resource);

    log.info(`Playing TTS audio in guild ${guildId}: ${audioFilePath}`);

    // Wait for playback to complete
    await new Promise<void>((resolve, reject) => {
      const onIdle = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        player.off(AudioPlayerStatus.Idle, onIdle);
        player.off('error', onError);
      };

      player.once(AudioPlayerStatus.Idle, onIdle);
      player.once('error', onError);
    });

    log.debug(`TTS playback completed in guild ${guildId}`);
  } catch (error) {
    log.error(`Failed to play TTS audio in guild ${guildId}: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Stop TTS playback in a guild
 */
export function stopTTS(guildId: string): void {
  const player = ttsPlayers.get(guildId);
  if (player) {
    player.stop();
    log.debug(`Stopped TTS player in guild ${guildId}`);
  }
}

/**
 * Cleanup TTS player for a guild
 */
export function cleanupTTSPlayer(guildId: string): void {
  const player = ttsPlayers.get(guildId);
  if (player) {
    player.stop();
    ttsPlayers.delete(guildId);
    log.debug(`Cleaned up TTS player for guild ${guildId}`);
  }
}

/**
 * Get all guild IDs with active TTS players
 */
export function getActiveTTSGuilds(): string[] {
  return Array.from(ttsPlayers.keys());
}
