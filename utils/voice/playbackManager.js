/**
 * Playback Manager - Handles playback control and audio resources
 */
const { createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { createLogger } = require('../logger');
const { getVoiceState } = require('./connectionManager');
const storage = require('../storage');

const log = createLogger('PLAYBACK');

/**
 * Helper to create audio resource with inline volume support
 * @param {Stream} input - Audio input stream
 * @param {Object} options - Resource options
 * @returns {AudioResource}
 */
function createVolumeResource(input, options = {}) {
  return createAudioResource(input, {
    ...options,
    inlineVolume: true,
  });
}

/**
 * Play a resource with volume applied
 * @param {Object} state - Voice state
 * @param {AudioResource} resource - Audio resource
 */
function playWithVolume(state, resource) {
  if (resource.volume) {
    resource.volume.setVolume((state.volume || 100) / 100);
  }
  state.currentResource = resource;
  state.player.play(resource);
}

/**
 * Play next track in queue
 * @param {string} guildId - Guild ID
 * @returns {Promise<Track|null>} - Next track or null
 */
async function playNext(guildId) {
  const state = getVoiceState(guildId);
  if (!state || state.queue.length === 0) {
    if (state) {
      state.nowPlaying = null;
      state.currentTrack = null;
      state.preBuffered = null;
    }
    return null;
  }

  const nextTrack = state.queue.shift();
  log.info(`Playing next: ${nextTrack.title}`);

  // TODO: Implement full playback with streaming
  // For now, just update state
  state.nowPlaying = nextTrack.title;
  state.currentTrack = nextTrack;
  state.playbackStartTime = Date.now();
  state.totalPausedTime = 0;
  state.pauseStartTime = null;

  return nextTrack;
}

/**
 * Toggle pause/resume playback
 * @param {string} guildId - Guild ID
 * @returns {{paused: boolean}}
 */
function togglePause(guildId) {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  if (state.overlayProcess) {
    log.debug('Overlay active, ignoring pause/resume');
    return { paused: state.player.state.status === AudioPlayerStatus.Paused };
  }

  if (state.player.state.status === AudioPlayerStatus.Paused) {
    state.player.unpause();
    if (state.pauseStartTime) {
      const pauseDuration = Date.now() - state.pauseStartTime;
      state.totalPausedTime = (state.totalPausedTime || 0) + pauseDuration;
      state.pauseStartTime = null;
    }
    log.info('Resumed playback');
    return { paused: false };
  } else if (state.player.state.status === AudioPlayerStatus.Playing) {
    state.player.pause();
    state.pauseStartTime = Date.now();
    log.info('Paused playback');
    return { paused: true };
  } else {
    throw new Error('Nothing is playing');
  }
}

/**
 * Stop current playback and clear queue
 * @param {string} guildId - Guild ID
 * @returns {boolean}
 */
function stopSound(guildId) {
  const state = getVoiceState(guildId);
  if (state && state.player) {
    state.queue = [];
    state.player.stop();
    state.nowPlaying = null;
    state.currentTrack = null;
    state.currentTrackSource = null;
    state.playbackStartTime = null;
    state.pauseStartTime = null;
    state.totalPausedTime = 0;
    log.debug(`Stopped playback in guild ${guildId}`);
    return true;
  }
  return false;
}

/**
 * Set volume for a guild
 * @param {string} guildId - Guild ID
 * @param {number} level - Volume level (1-100)
 * @returns {number} - Actual volume set
 */
function setVolume(guildId, level) {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  const volume = Math.max(1, Math.min(100, level));
  state.volume = volume;

  if (state.currentResource && state.currentResource.volume) {
    state.currentResource.volume.setVolume(volume / 100);
  }

  log.info(`Set volume to ${volume}%`);
  return volume;
}

/**
 * Play a sound immediately (interrupts current playback)
 * @param {string} guildId - Guild ID
 * @param {AudioResource} resource - Audio resource
 * @param {string} title - Sound title
 */
function playSoundImmediate(guildId, resource, title) {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  // Kill any existing overlay
  if (state.overlayProcess) {
    try {
      state.overlayProcess.kill('SIGKILL');
    } catch (err) {
      log.debug(`Failed to kill overlay process: ${err.message}`);
    }
    state.overlayProcess = null;
  }

  state.player.play(resource);
  state.nowPlaying = title;
  state.currentTrackSource = null;
  log.info(`Playing sound immediately: ${title}`);
}

/**
 * Play soundboard overlay on current music
 * @param {string} guildId - Guild ID
 * @param {string} soundName - Sound file name
 * @returns {Promise<Object>} - Overlay result
 */
async function playSoundboardOverlay(guildId, soundName) {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  const exists = await storage.soundExists(soundName);
  if (!exists) {
    throw new Error(`Sound file not found: ${soundName}`);
  }

  // For now, just play soundboard directly (full FFmpeg overlay would go here)
  log.info(`Playing soundboard: ${soundName}`);
  const soundStream = await storage.getSoundStream(soundName);
  const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });
  
  playSoundImmediate(guildId, resource, `🔊 ${soundName}`);

  return {
    overlaid: false,
    sound: soundName,
    message: 'Playing soundboard (overlay not implemented)',
  };
}

module.exports = {
  playNext,
  togglePause,
  stopSound,
  setVolume,
  playSoundImmediate,
  playSoundboardOverlay,
  createVolumeResource,
  playWithVolume,
};
