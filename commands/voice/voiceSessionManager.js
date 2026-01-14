const { getVoiceConnection, joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { getVoiceInteractionManager } = require('./voiceInteractionInstance');
const { checkVoicePermissions } = require('./commandHelpers');
const { createLogger } = require('../logger');

const log = createLogger('VOICE_SESSION');

/**
 * Ensures a voice session exists for a guild.
 * Auto-joins the user's VC if bot is not connected.
 * Initializes voice interaction listening for existing members.
 *
 * @param {Object} params
 * @param {string} params.guildId
 * @param {import("discord.js").VoiceChannel} params.voiceChannel
 */
async function ensureSession({ guildId, voiceChannel }) {
  const botUser = voiceChannel.client.user;

  // Check permissions
  const perms = checkVoicePermissions(voiceChannel, botUser);
  if (!perms.hasPermissions) {
    throw new Error(perms.error.content.replace(/❌ /, ''));
  }

  // Check existing connection
  let connection = getVoiceConnection(guildId);
  if (!connection) {
    log.info(`Joining VC: ${voiceChannel.name} (${guildId})`);
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    // Wait until ready or fail
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10000);
    } catch (err) {
      connection.destroy();
      throw new Error(`Failed to connect to voice channel: ${err.message}`);
    }
  }

  // Initialize voice interaction
  const voiceInteractionMgr = getVoiceInteractionManager();
  if (voiceInteractionMgr && voiceInteractionMgr.isEnabledForGuild(guildId)) {
    const members = voiceChannel.members.filter((m) => !m.user.bot);
    for (const [userId, member] of members) {
      try {
        await voiceInteractionMgr.startListening(userId, guildId, connection);
        log.info(`Started voice listening for existing user: ${member.user.tag}`);
      } catch (err) {
        log.warn(`Failed to start listening for ${member.user.tag}: ${err.message}`);
      }
    }
  }

  return connection;
}

/**
 * Cleans up a voice session (stops listening for all users)
 *
 * @param {string} guildId
 */
async function cleanupSession(guildId) {
  const voiceInteractionMgr = getVoiceInteractionManager();
  if (voiceInteractionMgr?.stopAll) {
    try {
      await voiceInteractionMgr.stopAll(guildId);
      log.info(`Stopped all voice listening in guild ${guildId}`);
    } catch (err) {
      log.warn(`Failed to cleanup voice listening: ${err.message}`);
    }
  }

  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    log.info(`Destroyed voice connection in guild ${guildId}`);
  }
}

module.exports = {
  ensureSession,
  cleanupSession,
};
