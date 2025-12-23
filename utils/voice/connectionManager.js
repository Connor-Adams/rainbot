/**
 * Connection Manager - Handles voice connections and state
 */
const {
  joinVoiceChannel,
  createAudioPlayer,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const { createLogger } = require('../logger');

const log = createLogger('CONNECTION');

/** @type {Map<string, VoiceState>} Map of guildId -> voice state */
const voiceStates = new Map();

/**
 * Join a voice channel
 * @param {Object} channel - Discord voice channel object
 * @returns {Promise<{connection: VoiceConnection, player: AudioPlayer}>}
 */
async function joinChannel(channel) {
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

  voiceStates.set(guildId, {
    connection,
    player,
    nowPlaying: null,
    currentTrack: null,
    currentResource: null,
    queue: [],
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
  });

  log.info(`Joined voice channel: ${channel.name} (${channel.guild.name})`);
  return { connection, player };
}

/**
 * Leave a voice channel
 * @param {string} guildId - Guild ID
 * @returns {boolean} - Whether the channel was left
 */
function leaveChannel(guildId) {
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
 * @param {string} guildId - Guild ID
 * @returns {VoiceState|undefined}
 */
function getVoiceState(guildId) {
  return voiceStates.get(guildId);
}

/**
 * Get all active voice connections
 * @returns {Array<Object>} - Array of connection info objects
 */
function getAllConnections() {
  const connections = [];
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

module.exports = {
  joinChannel,
  leaveChannel,
  getVoiceState,
  getAllConnections,
  voiceStates,
};
