const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createLogger } = require('../dist/utils/logger');
const listeningHistory = require('../dist/utils/listeningHistory');
const stats = require('../dist/utils/statistics');
const { getVoiceConnection } = require('@discordjs/voice');

const log = createLogger('VOICE_STATE');

// Lazy load voiceManager to avoid circular dependency
let voiceManager = null;
function getVoiceManager() {
  if (!voiceManager) voiceManager = require('../dist/utils/voiceManager');
  return voiceManager;
}

// Lazy load voice interaction manager
let voiceInteractionManager = null;
function getVoiceInteractionManager() {
  if (!voiceInteractionManager) {
    try {
      const { getVoiceInteractionManager } = require('../dist/utils/voice/voiceInteractionInstance');
      voiceInteractionManager = getVoiceInteractionManager();
    } catch (err) {
      log.debug(`Voice interaction manager not available: ${err.message}`);
      return null;
    }
  }
  return voiceInteractionManager;
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    // Skip if no channel change
    if (oldState.channelId === newState.channelId) return;

    const userId = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id || oldState.guild?.id;
    const user = newState.member?.user || oldState.member?.user;
    if (!userId || !guildId || user?.bot) return;

    const vm = getVoiceManager();
    const botStatus = vm.getStatus(guildId);
    if (!botStatus) return;

    const botChannelId = botStatus.channelId;
    const voiceInteractionMgr = getVoiceInteractionManager();

    // --- USER LEFT BOT'S CHANNEL ---
    if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
      log.debug(`User ${user?.tag || userId} left bot's channel`);

      stats.endUserSession(userId, guildId, botChannelId);

      if (voiceInteractionMgr) {
        try {
          await voiceInteractionMgr.stopListening(userId, guildId);
          log.debug(`Stopped voice listening for ${userId}`);
        } catch (err) {
          log.debug(`Failed to stop voice listening: ${err.message}`);
        }
      }
      return;
    }

    // --- USER JOINED BOT'S CHANNEL ---
    if (newState.channelId === botChannelId && oldState.channelId !== botChannelId) {
      log.debug(`User ${user?.tag || userId} joined bot's channel`);

      const channel = newState.channel;
      stats.startUserSession(
        userId,
        guildId,
        botChannelId,
        channel?.name || null,
        user?.username || null,
        user?.discriminator || null
      );

      if (voiceInteractionMgr?.isEnabledForGuild(guildId)) {
        try {
          const connection = getVoiceConnection(guildId);
          if (connection) {
            await voiceInteractionMgr.startListening(userId, guildId, connection);
            log.info(`✅ Started voice listening for ${user?.tag || userId}`);
          } else {
            log.warn(`No voice connection found for guild ${guildId}`);
          }
        } catch (err) {
          log.error(`Failed to start voice listening: ${err.message}`);
        }
      }
    }

    // --- RESUME PROMPT LOGIC ---
    // Only trigger for joins to bot channel
    if (newState.channelId !== botChannelId) return;

    // Check listening history
    let history = await listeningHistory.getRecentHistory(userId, guildId);
    if (!history) history = listeningHistory.getHistory(userId);
    if (!history || history.queue.length === 0 || history.guildId !== guildId) return;

    const { queue } = vm.getQueue(guildId);
    if (botStatus.nowPlaying || queue.length > 0) return;

    log.info(`User ${user?.tag || userId} joined VC with history`);

    try {
      const embed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle('🎵 Resume Listening?')
        .setDescription(`Hey ${newState.member.displayName}! I noticed you were listening to music earlier.`)
        .addFields({
          name: '📋 Last Session',
          value: history.nowPlaying
            ? `**${history.nowPlaying}**\n*${history.queue.length} track${history.queue.length === 1 ? '' : 's'} in queue*`
            : `*${history.queue.length} track${history.queue.length === 1 ? '' : 's'} in queue*`,
          inline: false,
        })
        .setFooter({ text: 'Click "Resume" to continue where you left off, or "Dismiss" to start fresh' })
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

      // Try DM first, fallback to channel
      try {
        await newState.member.send({ embeds: [embed], components: [row] });
      } catch {
        const channel = newState.guild.channels.cache.get(botChannelId);
        if (channel) await channel.send({ content: `${newState.member}`, embeds: [embed], components: [row] });
      }
    } catch (err) {
      log.error(`Failed to send resume prompt: ${err.message}`);
    }
  },
};
