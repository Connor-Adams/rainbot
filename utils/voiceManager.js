const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} = require('@discordjs/voice');
const path = require('path');

// Import split modules
const connectionManager = require('./voice/connectionManager');
const queueManager = require('./voice/queueManager');
const playbackManager = require('./voice/playbackManager');
const trackFetcher = require('./voice/trackFetcher');
const snapshotPersistence = require('./voice/snapshotPersistence');

const { createLogger } = require('./logger');
const stats = require('./statistics');
const storage = require('./storage');
const listeningHistory = require('./listeningHistory');

const log = createLogger('VOICE');

// ============================================================================
// TYPE DEFINITIONS (JSDoc)
// ============================================================================

/**
 * @typedef {Object} Track
 * @property {string} title - Track title
 * @property {string} [url] - Source URL (YouTube, Spotify, SoundCloud, etc.)
 * @property {number} [duration] - Duration in seconds
 * @property {boolean} [isLocal] - Whether this is a local soundboard file
 * @property {boolean} [isStream] - Whether this is a stream vs file
 * @property {string} [source] - Request source ('discord' or 'api')
 * @property {string} [userId] - Discord ID of user who queued it
 * @property {string} [username] - Discord username
 * @property {string} [discriminator] - Discord discriminator
 * @property {string} [spotifyId] - Spotify track ID (if applicable)
 * @property {string} [spotifyUrl] - Spotify URL (if applicable)
 * @property {string} [sourceType] - Type: 'youtube', 'spotify', 'soundcloud', 'local', 'other'
 */

// ============================================================================
// HELPERS
// ============================================================================

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

// ============================================================================
// PUBLIC API - DELEGATES TO MODULES
// ============================================================================

/**
 * Join a voice channel
 */
async function joinChannel(channel) {
  const result = await connectionManager.joinChannel(channel);
  
  // Track voice join event
  stats.trackVoiceEvent('join', channel.guild.id, channel.id, channel.name, 'discord');
  
  return result;
}

/**
 * Leave a voice channel
 */
function leaveChannel(guildId) {
  const state = connectionManager.getVoiceState(guildId);
  
  // Save queue snapshot if there's content to preserve
  if (state && (state.currentTrack || state.queue.length > 0)) {
    snapshotPersistence.saveQueueSnapshot(guildId).catch((e) =>
      log.error(`Failed to save queue snapshot on leave: ${e.message}`)
    );
  }

  // Save history before leaving
  if (state && state.lastUserId) {
    const { nowPlaying, queue, currentTrack } = getQueue(guildId);
    listeningHistory.saveHistory(state.lastUserId, guildId, queue, nowPlaying, currentTrack);
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

/**
 * Play a soundboard sound overlaid on current music
 * Uses FFmpeg to mix the soundboard with ducked music
 * @param {string} guildId - Guild ID
 * @param {string} soundName - Name of the sound file
 * @param {string} userId - User ID who triggered the soundboard (optional)
 * @param {string} source - Source of the request ('discord' or 'api', default: 'discord')
 * @param {string} username - Discord username (optional)
 * @param {string} discriminator - Discord discriminator (optional)
 */
async function playSoundboardOverlay(
  guildId,
  soundName,
  userId = null,
  source = 'discord',
  username = null,
  discriminator = null
) {
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
 * @param {string} guildId - Guild ID
 * @param {string} source - Source URL or sound name
 * @param {string} userId - User ID who initiated playback (optional, for history tracking)
 * @param {string} requestSource - Source of the request ('discord' or 'api', default: 'discord')
 * @param {string} username - Discord username (optional)
 * @param {string} discriminator - Discord discriminator (optional)
 */
async function playSound(
  guildId,
  source,
  userId = null,
  requestSource = 'discord',
  username = null,
  discriminator = null
) {
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
  if (tracks.length === 1 && tracks[0].isLocal && tracks[0].isSoundboard) {
    const track = tracks[0];
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
        log.warn(`Overlay failed, playing soundboard directly: ${overlayError.message}`);
        // Fallback handled by playbackManager
        const soundStream = await storage.getSoundStream(source);
        const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });
        
        playbackManager.playSoundImmediate(guildId, resource, track.title);
        
        trackSoundboardUsage(source, userId, guildId, requestSource, username, discriminator);
        
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
      
      trackSoundboardUsage(source, userId, guildId, requestSource, username, discriminator);
      
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
    const { nowPlaying, queue } = getQueue(guildId);
    listeningHistory.saveHistory(userId, guildId, queue, nowPlaying, state.currentTrack);
  }

  return {
    added: result.added,
    tracks: result.tracks.slice(0, 5),
    totalInQueue: state.queue.length,
  };
}

/**
 * Skip current track(s)
 * @param {string} guildId - Guild ID
 * @param {number} count - Number of tracks to skip (default: 1)
 * @returns {Promise<Array<string>>} Array of skipped track titles
 */
async function skip(guildId, count = 1) {
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
function togglePause(guildId) {
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
function getQueue(guildId) {
  return queueManager.getQueue(guildId);
}

/**
 * Clear the queue
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} Number of cleared tracks
 */
async function clearQueue(guildId) {
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
 * @param {string} guildId - Guild ID
 * @param {number} index - Queue index to remove
 * @returns {Promise<Track>} Removed track
 */
async function removeTrackFromQueue(guildId, index) {
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
function stopSound(guildId) {
  const state = connectionManager.getVoiceState(guildId);
  
  // Save history before stopping
  if (state?.lastUserId) {
    const { nowPlaying, queue, currentTrack } = getQueue(guildId);
    listeningHistory.saveHistory(state.lastUserId, guildId, queue, nowPlaying, currentTrack);
  }
  
  return playbackManager.stopSound(guildId);
}

/**
 * Get status for a guild
 */
function getStatus(guildId) {
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
    volume: state.volume || 100,
  };
}

/**
 * Set volume for a guild (1-100)
 */
function setVolume(guildId, level) {
  return playbackManager.setVolume(guildId, level);
}

/**
 * Get all active voice connections
 */
function getAllConnections() {
  return connectionManager.getAllConnections();
}

/**
 * List all available sounds
 */
async function listSounds() {
  return await storage.listSounds();
}

/**
 * Delete a sound file
 */
async function deleteSound(filename) {
  return await storage.deleteSound(filename);
}

/**
 * Resume listening history for a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Object} Result object with restored tracks count
 */
async function resumeHistory(guildId, userId) {
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

  // Restore queue using queueManager
  await queueManager.restoreQueue(guildId, history.queue);
  state.lastUserId = userId;

  // Start playing if not already
  const isPlaying = state.player.state.status === AudioPlayerStatus.Playing;
  if (!isPlaying && state.queue.length > 0) {
    playbackManager.playNext(guildId).catch((err) => {
      log.error(`Failed to resume playback: ${err.message}`);
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
 * @param {string} guildId - Guild ID
 */
async function saveQueueSnapshot(guildId) {
  return snapshotPersistence.saveQueueSnapshot(guildId);
}

/**
 * Save all active queue snapshots (for graceful shutdown)
 */
async function saveAllQueueSnapshots() {
  return snapshotPersistence.saveAllQueueSnapshots();
}

/**
 * Restore queue snapshot from database
 * @param {string} guildId - Guild ID
 * @param {Object} client - Discord client
 * @returns {boolean} Whether restore was successful
 */
async function restoreQueueSnapshot(guildId, client) {
  return snapshotPersistence.restoreQueueSnapshot(guildId, client);
}

/**
 * Restore all queue snapshots (called on bot startup)
 * @param {Object} client - Discord client
 * @returns {number} Number of successfully restored snapshots
 */
async function restoreAllQueueSnapshots(client) {
  return snapshotPersistence.restoreAllQueueSnapshots(client);
}

module.exports = {
  joinChannel,
  leaveChannel,
  playSound,
  playSoundboardOverlay,
  skip,
  togglePause,
  getQueue,
  clearQueue,
  removeTrackFromQueue,
  stopSound,
  getStatus,
  setVolume,
  getAllConnections,
  listSounds,
  deleteSound,
  resumeHistory,
  saveQueueSnapshot,
  saveAllQueueSnapshots,
  restoreQueueSnapshot,
  restoreAllQueueSnapshots,
};
