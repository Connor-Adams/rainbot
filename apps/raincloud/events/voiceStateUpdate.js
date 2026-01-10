const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createLogger } = require('../utils/logger.ts');
const listeningHistory = require('../utils/listeningHistory.ts');
const stats = require('../utils/statistics.ts');

const log = createLogger('VOICE_STATE');

// Lazy load voiceManager to avoid circular dependency
let voiceManager = null;
function getVoiceManager() {
  if (!voiceManager) {
    voiceManager = require('../utils/voiceManager.ts');
  }
  return voiceManager;
}

// Lazy load voice interaction manager
let voiceInteractionManager = null;
function getVoiceInteractionManager() {
  if (!voiceInteractionManager) {
    try {
      const { getVoiceInteractionManager } = require('../utils/voice/voiceInteractionInstance.ts');
      voiceInteractionManager = getVoiceInteractionManager();
    } catch (error) {
      log.debug(`Voice interaction manager not available: ${error.message}`);
      return null;
    }
  }
  return voiceInteractionManager;
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    // Ignore if channel didn't change
    if (oldState.channelId === newState.channelId) return;

    const userId = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id || oldState.guild?.id;
    const user = newState.member?.user || oldState.member?.user;

    if (!userId || !guildId) return;

    // Ignore bots
    if (user?.bot) return;

    const vm = getVoiceManager();
    const botStatus = vm.getStatus(guildId);
    if (!botStatus) return;

    const botChannelId = botStatus.channelId;

    // User left the bot's channel
    if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
      log.debug(`User ${user?.tag || userId} left bot's channel`);
      stats.endUserSession(userId, guildId, botChannelId);

      // Stop voice interaction listening
      const voiceManager = getVoiceInteractionManager();
      if (voiceManager) {
        try {
          await voiceManager.stopListening(userId, guildId);
          log.debug(`Stopped voice listening for user ${userId}`);
        } catch (error) {
          log.debug(`Failed to stop voice listening: ${error.message}`);
        }
      }
      return;
    }

    // User joined the bot's channel
    if (newState.channelId === botChannelId && oldState.channelId !== botChannelId) {
      const channel = newState.channel;
      log.debug(`User ${user?.tag || userId} joined bot's channel`);
      stats.startUserSession(
        userId,
        guildId,
        botChannelId,
        channel?.name || null,
        user?.username || null,
        user?.discriminator || null
      );

      // Start voice interaction listening if enabled
      const voiceInteractionMgr = getVoiceInteractionManager();
      log.debug(`Voice interaction manager available: ${!!voiceInteractionMgr}`);
      if (voiceInteractionMgr) {
        const isEnabled = voiceInteractionMgr.isEnabledForGuild(guildId);
        log.debug(`Voice control enabled for guild: ${isEnabled}`);
        if (isEnabled) {
          try {
            // Use @discordjs/voice's getVoiceConnection
            const { getVoiceConnection } = require('@discordjs/voice');
            const connection = getVoiceConnection(guildId);
            log.debug(`Got voice connection: ${!!connection}`);
            if (connection) {
              await voiceInteractionMgr.startListening(userId, guildId, connection);
              log.info(`✅ Started voice listening for user ${user?.tag || userId}`);
            } else {
              log.warn(`No voice connection found for guild ${guildId}`);
            }
          } catch (error) {
            log.error(`Failed to start voice listening: ${error.message}`);
          }
        }
      }
    }

    // Continue with resume prompt logic only for joins
    if (!newState.channelId) return; // User left voice entirely
    const channelId = newState.channelId;
    if (botChannelId !== channelId) return;

    // Check if user has listening history (try database first, fall back to in-memory)
    let history = await listeningHistory.getRecentHistory(userId, guildId);
    if (!history) {
      history = listeningHistory.getHistory(userId);
    }
    if (!history || history.queue.length === 0) return;

    // Don't show resume prompt if history is from a different guild
    if (history.guildId !== guildId) return;

    // Don't show if bot is already playing something or has a queue
    const { queue } = vm.getQueue(guildId);
    if (botStatus.nowPlaying || queue.length > 0) return;

    log.info(`User ${newState.member.user.tag} joined voice channel with history`);

    try {
      // Create resume prompt embed
      const embed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle('🎵 Resume Listening?')
        .setDescription(
          `Hey ${newState.member.displayName}! I noticed you were listening to music earlier.`
        )
        .addFields({
          name: '📋 Last Session',
          value: history.nowPlaying
            ? `**${history.nowPlaying}**\n*${history.queue.length} track${history.queue.length === 1 ? '' : 's'} in queue*`
            : `*${history.queue.length} track${history.queue.length === 1 ? '' : 's'} in queue*`,
          inline: false,
        })
        .setFooter({
          text: 'Click "Resume" to continue where you left off, or "Dismiss" to start fresh',
        })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`resume_${userId}`)
          .setLabel('Resume')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`dismiss_history_${userId}`)
          .setLabel('Dismiss')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary)
      );

      // Send DM to user if possible, otherwise send to channel
      try {
        await newState.member.send({
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        // Can't DM user (DMs disabled), send to voice channel instead
        const channel = newState.guild.channels.cache.get(channelId);
        if (channel) {
          await channel.send({
            content: `${newState.member}`,
            embeds: [embed],
            components: [row],
          });
        }
        throw new Error(error);
      }
    } catch (error) {
      log.error(`Failed to send resume prompt: ${error.message}`);
    }
  },
};
