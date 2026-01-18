import { createAudioResource, StreamType, AudioPlayerStatus } from '@discordjs/voice';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { createLogger } from '../logger';
import { getStreamUrl } from './audioResource';
import * as storage from '../storage';
import * as stats from '../statistics';
import * as listeningHistory from '../listeningHistory';
import type { VoiceState } from '@rainbot/protocol';

const log = createLogger('SOUNDBOARD');

/**
 * Track soundboard usage in statistics and listening history
 */
export function trackSoundboardUsage(
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

export interface SoundboardResult {
  overlaid: boolean;
  sound: string;
  message: string;
}

/**
 * Play soundboard sound directly (no overlay)
 */
export async function playSoundboardDirect(
  state: VoiceState,
  soundName: string,
  userId: string,
  source: string,
  username: string | null,
  discriminator: string | null
): Promise<SoundboardResult> {
  const soundStream = await storage.getSoundStream(soundName);

  // Handle stream errors to prevent crashes
  soundStream.on('error', (err) => {
    log.debug(`Soundboard stream error: ${err.message}`);
  });

  // Soundboard plays at full volume (no inlineVolume)
  const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });

  // Add error handler to the resource's readable stream to catch any wrapped stream errors
  if (resource.playStream) {
    resource.playStream.on('error', (err) => {
      log.debug(`AudioResource stream error: ${err.message}`);
    });
  }

  // Kill any existing overlay
  const overlayProcess = state.overlayProcess as ChildProcess | null;
  if (overlayProcess) {
    try {
      overlayProcess.kill('SIGKILL');
    } catch {
      // Ignore errors
    }
    state.overlayProcess = null;
  }

  log.debug(
    `playSoundboardDirect: resource readable=${resource.readable}, playStream=${!!resource.playStream}`
  );
  state.player.play(resource);
  log.debug(`playSoundboardDirect: player state after play()=${state.player.state.status}`);
  // Don't set currentResource - soundboard plays at full volume and shouldn't be affected by volume changes
  state.nowPlaying = `🔊 ${path.basename(soundName, path.extname(soundName))}`;
  state.currentTrackSource = null;

  trackSoundboardUsage(soundName, userId, state.channelId, source, username, discriminator);

  return {
    overlaid: false,
    sound: soundName,
    message: 'Playing soundboard',
  };
}

/**
 * Play a soundboard sound overlaid on current music
 * Uses FFmpeg to mix the soundboard with ducked music
 */
export async function playSoundboardOverlay(
  state: VoiceState,
  guildId: string,
  soundName: string,
  userId: string,
  source: string,
  username: string | null,
  discriminator: string | null
): Promise<SoundboardResult> {
  // Check if sound exists
  const exists = await storage.soundExists(soundName);
  if (!exists) {
    throw new Error(`Sound file not found: ${soundName}`);
  }

  const isPaused = state.player.state.status === AudioPlayerStatus.Paused;
  const hasMusicSource = state.currentTrackSource;

  // If no music source, play directly
  if (!hasMusicSource) {
    log.debug('No music source, playing soundboard normally');
    return playSoundboardDirect(state, soundName, userId, source, username, discriminator);
  }

  log.info(`Overlaying soundboard "${soundName}" on music`);

  try {
    // Get the music stream URL (hasMusicSource check above ensures it's not null)
    const musicStreamUrl = await getStreamUrl(state.currentTrackSource!);

    // Calculate current playback position before transitioning to overlay
    let playbackPosition = 0;
    if (state.playbackStartTime) {
      const elapsed = Date.now() - state.playbackStartTime;
      const pausedTime = state.totalPausedTime || 0;
      const currentPauseTime = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
      playbackPosition = Math.max(0, Math.floor((elapsed - pausedTime - currentPauseTime) / 1000));
    }

    log.debug(`Seeking music to position: ${playbackPosition}s (paused: ${isPaused})`);

    const soundInput = 'pipe:3';
    // Apply user's volume to music, keep soundboard at full volume
    const musicVolume = (state.volume || 100) / 100;

    const ffmpegArgs = [
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
      '-ss',
      playbackPosition.toString(),
      '-i',
      musicStreamUrl,
      '-i',
      soundInput,
      '-filter_complex',
      `[0:a]volume=${musicVolume}[music];[1:a]volume=1.0[sound];[music][sound]amix=inputs=2:duration=longest:dropout_transition=0.5:normalize=0[out]`,
      '-map',
      '[out]',
      '-acodec',
      'libopus',
      '-b:a',
      '128k',
      '-f',
      'opus',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ];

    log.debug(`FFmpeg args: ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    });

    // Handle stdin errors to prevent unhandled error events
    if (ffmpeg.stdin) {
      ffmpeg.stdin.on('error', (err) => {
        log.debug(`FFmpeg stdin error: ${err.message}`);
      });
    }

    // Handle stdout errors BEFORE creating resource to prevent unhandled error events
    if (ffmpeg.stdout) {
      ffmpeg.stdout.on('error', (err) => {
        log.debug(`FFmpeg stdout error: ${err.message}`);
      });
    }

    // Pipe soundboard stream
    const soundStream = await storage.getSoundStream(soundName);
    soundStream.on('error', (err) => {
      log.debug(`Soundboard stream error: ${err.message}`);
    });

    // Handle errors on the pipe we're writing to (stdio[3])
    const soundInputPipe = ffmpeg.stdio[3] as NodeJS.WritableStream;
    soundInputPipe.on('error', (err) => {
      log.debug(`FFmpeg sound input pipe error: ${err.message}`);
    });
    soundStream.pipe(soundInputPipe);

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('frame=') && !msg.includes('size=')) {
        log.debug(`FFmpeg overlay: ${msg}`);
      }
    });

    ffmpeg.on('error', (err) => {
      log.error(`FFmpeg overlay error: ${err.message}`);
    });

    ffmpeg.on('close', (code) => {
      if (state.overlayProcess === ffmpeg) {
        state.overlayProcess = null;
      }

      if (code !== 0 && code !== 255) {
        log.warn(`FFmpeg overlay exited with code ${code}`);
      } else {
        log.debug(`FFmpeg overlay completed successfully`);
      }
    });

    // Create audio resource from FFmpeg output (volume already applied in FFmpeg filter)
    const resource = createAudioResource(ffmpeg.stdout!, {
      inputType: StreamType.OggOpus,
    });

    // Add error handler to the resource's readable stream to catch any wrapped stream errors
    if (resource.playStream) {
      resource.playStream.on('error', (err) => {
        log.debug(`AudioResource stream error: ${err.message}`);
      });
    }

    // Clean up any existing overlay process and stop player JUST before playing new overlay
    // This minimizes the gap between stop and play for seamless transition
    const existingOverlay = state.overlayProcess as ChildProcess | null;
    if (existingOverlay) {
      log.debug('Killing existing overlay process for new soundboard');
      try {
        // Set flag to prevent idle handler from calling playNext
        state.isTransitioningToOverlay = true;
        existingOverlay.kill('SIGKILL');
        state.overlayProcess = null;
      } catch (err) {
        log.debug(`Error killing old overlay: ${(err as Error).message}`);
        // Even if killing the old overlay fails, clear the reference here because we are
        // about to replace it with the new overlay process (see assignment below). Keeping
        // a stale reference could cause other logic to treat the old process as the active overlay.
        state.overlayProcess = null;
      }
    } else {
      // First overlay - set flag to prevent idle handler from advancing queue
      log.debug('Starting first overlay');
      state.isTransitioningToOverlay = true;
    }

    state.player.play(resource);
    // Don't set currentResource - volume is baked into FFmpeg, changes during overlay not supported
    state.nowPlaying = `${state.nowPlaying} 🔊`;
    state.overlayProcess = ffmpeg;
    state.playbackStartTime = Date.now() - playbackPosition * 1000;
    state.totalPausedTime = 0;

    // Clear the transition flag now that overlay is playing
    state.isTransitioningToOverlay = false;

    log.info(`Soundboard "${soundName}" overlaid on music`);

    trackSoundboardUsage(soundName, userId, guildId, source, username, discriminator);

    return {
      overlaid: true,
      sound: soundName,
      message: 'Soundboard playing over music',
    };
  } catch (error) {
    log.error(`Failed to overlay soundboard: ${(error as Error).message}`);
    // Clear the transition flag on error
    state.isTransitioningToOverlay = false;
    // Fallback to direct playback
    return playSoundboardDirect(state, soundName, userId, source, username, discriminator);
  }
}
