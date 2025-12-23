const { createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const { createLogger } = require('../logger');
const { getStreamUrl } = require('./audioResource');
const storage = require('../storage');
const stats = require('../statistics');
const listeningHistory = require('../listeningHistory');

const log = createLogger('SOUNDBOARD');

/**
 * Track soundboard usage in statistics and listening history
 * @param {string} soundName - Name of the sound file
 * @param {string} userId - User ID who triggered the soundboard
 * @param {string} guildId - Guild ID
 * @param {string} source - Request source ('discord' or 'api')
 * @param {string} [username] - Discord username
 * @param {string} [discriminator] - Discord discriminator
 */
function trackSoundboardUsage(
  soundName,
  userId,
  guildId,
  source,
  username = null,
  discriminator = null
) {
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
        url: null,
        duration: null,
        isLocal: true,
        sourceType: 'local',
        source,
        isSoundboard: true,
      },
      userId
    )
    .catch((err) => log.error(`Failed to track soundboard history: ${err.message}`));
}

/**
 * Play soundboard sound directly (no overlay)
 * @param {Object} state - Voice state
 * @param {string} soundName - Sound file name
 * @param {string} userId - User ID
 * @param {string} source - Request source
 * @param {string} username - Username
 * @param {string} discriminator - Discriminator
 * @returns {Promise<Object>} Result object
 */
async function playSoundboardDirect(state, soundName, userId, source, username, discriminator) {
  const soundStream = await storage.getSoundStream(soundName);
  const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });

  // Kill any existing overlay
  if (state.overlayProcess) {
    try {
      state.overlayProcess.kill('SIGKILL');
    } catch {
      // Ignore errors
    }
    state.overlayProcess = null;
  }

  state.player.play(resource);
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
 * @param {Object} state - Voice state object
 * @param {string} guildId - Guild ID
 * @param {string} soundName - Name of the sound file
 * @param {string} userId - User ID who triggered the soundboard
 * @param {string} source - Source of the request ('discord' or 'api')
 * @param {string} username - Discord username
 * @param {string} discriminator - Discord discriminator
 * @returns {Promise<Object>} Result object
 */
async function playSoundboardOverlay(
  state,
  guildId,
  soundName,
  userId,
  source,
  username,
  discriminator
) {
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
    // Clean up any existing overlay process
    if (state.overlayProcess) {
      log.debug('Killing existing overlay process for new soundboard');
      try {
        state.overlayProcess.kill('SIGKILL');
        state.player.stop();
      } catch (err) {
        log.debug(`Error killing old overlay: ${err.message}`);
      }
      state.overlayProcess = null;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Get the music stream URL
    const musicStreamUrl = await getStreamUrl(state.currentTrackSource);

    // Calculate current playback position
    let playbackPosition = 0;
    if (state.playbackStartTime) {
      const elapsed = Date.now() - state.playbackStartTime;
      const pausedTime = state.totalPausedTime || 0;
      const currentPauseTime = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
      playbackPosition = Math.max(0, Math.floor((elapsed - pausedTime - currentPauseTime) / 1000));
    }

    log.debug(`Seeking music to position: ${playbackPosition}s (paused: ${isPaused})`);

    const soundInput = 'pipe:3';

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
      '[0:a]volume=1.0[music];[1:a]volume=1.0[sound];[music][sound]amix=inputs=2:duration=longest:dropout_transition=0.5:normalize=0[out]',
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

    // Pipe soundboard stream
    const soundStream = await storage.getSoundStream(soundName);
    soundStream.pipe(ffmpeg.stdio[3]);

    ffmpeg.stderr.on('data', (data) => {
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

    // Create audio resource from FFmpeg output
    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.OggOpus,
    });

    // Play the mixed audio
    state.player.play(resource);
    state.nowPlaying = `${state.nowPlaying} 🔊`;
    state.overlayProcess = ffmpeg;
    state.playbackStartTime = Date.now() - playbackPosition * 1000;
    state.totalPausedTime = 0;

    log.info(`Soundboard "${soundName}" overlaid on music`);

    trackSoundboardUsage(soundName, userId, guildId, source, username, discriminator);

    return {
      overlaid: true,
      sound: soundName,
      message: 'Soundboard playing over music',
    };
  } catch (error) {
    log.error(`Failed to overlay soundboard: ${error.message}`);
    // Fallback to direct playback
    return playSoundboardDirect(state, soundName, userId, source, username, discriminator);
  }
}

module.exports = {
  trackSoundboardUsage,
  playSoundboardDirect,
  playSoundboardOverlay,
};
