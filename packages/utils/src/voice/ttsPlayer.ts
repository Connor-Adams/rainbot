// util-category: audio
/**
 * TTS Player - Mixed audio output for text-to-speech
 * Uses FFmpeg to blend TTS with existing playback streams
 */
import {
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnection,
  // AudioPlayer, // For future mixer implementation
} from '@discordjs/voice';
// import { spawn } from 'child_process'; // For future mixer implementation
import { createReadStream, existsSync } from 'fs';
import { createLogger } from '../logger';
// import { PassThrough } from 'stream'; // For future mixer implementation

const log = createLogger('TTS_PLAYER');

/** Map of guildId -> TTS mixer state (for future implementation) */
/*
interface TTSMixerState {
  ttsStream: PassThrough | null;
  mixerProcess: any;
  mixedPlayer: AudioPlayer | null;
}

const ttsStates = new Map<string, TTSMixerState>();
*/

/*
 * Initialize TTS mixer for a guild
 * Creates FFmpeg process that mixes music and TTS streams
 * Note: Reserved for future full mixing implementation
 *
function initializeTTSMixer(guildId: string, connection: VoiceConnection): TTSMixerState {
  let state = ttsStates.get(guildId);
  
  if (state) {
    return state;
  }

  // Create TTS input stream
  const ttsStream = new PassThrough();
  
  // Create FFmpeg mixer process
  // Input 0: Music stream (will be connected to current player output)
  // Input 1: TTS stream (our PassThrough stream)
  const mixerProcess = spawn('ffmpeg', [
    // TTS input
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    '-i', 'pipe:0',
    
    // Mix filter: amix allows simultaneous playback
    '-filter_complex', '[0:a]volume=1.0[tts];[tts]aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo[out]',
    
    // Output
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ]);

  const mixedOutput = new PassThrough();
  
  ttsStream.pipe(mixerProcess.stdin);
  mixerProcess.stdout.pipe(mixedOutput);

  mixerProcess.stderr.on('data', (data) => {
    log.debug(`FFmpeg mixer: ${data.toString().trim()}`);
  });

  mixerProcess.on('error', (error) => {
    log.error(`FFmpeg mixer error: ${error.message}`);
  });

  mixerProcess.on('exit', (code) => {
    log.debug(`FFmpeg mixer exited with code ${code}`);
  });

  // Create audio player for mixed output
  const subscription = 'subscription' in connection.state ? connection.state.subscription : null;
  const mixedPlayer = subscription?.player || null;

  state = {
    ttsStream,
    mixerProcess,
    mixedPlayer,
  };

  ttsStates.set(guildId, state);
  log.info(`Initialized TTS mixer for guild ${guildId}`);

  return state;
}
*/

export interface PlayTTSAudioOptions {
  /** Return current playback position in seconds before TTS (for ducking). */
  onBeforeTTS?: () => Promise<number>;
  /** Resume playback at position (seconds) after TTS (for ducking). */
  onAfterTTS?: (positionSeconds: number) => Promise<void>;
}

/**
 * Play TTS audio. When music is playing and onBeforeTTS/onAfterTTS are provided,
 * ducks: pause music, play TTS, resume music at saved position.
 */
export async function playTTSAudio(
  guildId: string,
  connection: VoiceConnection,
  audioFilePath: string,
  options?: PlayTTSAudioOptions
): Promise<void> {
  try {
    if (!existsSync(audioFilePath)) {
      throw new Error(`TTS audio file not found: ${audioFilePath}`);
    }
    log.info(`Playing TTS audio in guild ${guildId}: ${audioFilePath}`);

    const subscription = 'subscription' in connection.state ? connection.state.subscription : null;
    if (!subscription) {
      log.warn(`No audio player subscription for guild ${guildId}`);
      return;
    }

    const player = subscription.player;
    const isPlaying = player.state.status === AudioPlayerStatus.Playing;

    if (isPlaying && options?.onBeforeTTS && options?.onAfterTTS) {
      // Ducking: pause music, get position, play TTS, resume at position
      const positionSeconds = await options.onBeforeTTS();
      log.info(`Ducking: pausing playback at ${positionSeconds}s for TTS in guild ${guildId}`);
      player.pause();

      const resource = createAudioResource(createReadStream(audioFilePath), {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });
      if (resource.volume) {
        resource.volume.setVolume(0.8);
      }
      player.play(resource);

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
        setTimeout(() => {
          cleanup();
          resolve();
        }, 30000);
      });

      await options.onAfterTTS(positionSeconds);
      log.debug(`TTS ducking completed, resumed at ${positionSeconds}s in guild ${guildId}`);
      return;
    }

    if (isPlaying) {
      log.info(
        `Music is playing - TTS skipped in guild ${guildId} (no resume callbacks). Provide onBeforeTTS/onAfterTTS for ducking.`
      );
      return;
    }

    // Play TTS when nothing else is playing
    const resource = createAudioResource(createReadStream(audioFilePath), {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });

    if (resource.volume) {
      resource.volume.setVolume(0.8);
    }

    player.play(resource);

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

      setTimeout(() => {
        cleanup();
        resolve();
      }, 30000);
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
export function stopTTS(_guildId: string): void {
  log.debug('TTS playback plays to completion');
}

/**
 * Cleanup TTS mixer for a guild
 */
export function cleanupTTSPlayer(_guildId: string): void {
  // For future implementation
  log.debug('TTS cleanup - no persistent state');
}

/**
 * Get all guild IDs with active TTS mixers
 */
export function getActiveTTSGuilds(): string[] {
  return [];
}
