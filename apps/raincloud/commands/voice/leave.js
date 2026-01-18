/**
 * Leave command - Multi-bot architecture version
 * Disconnects all worker bots from voice channel
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('@rainbot/utils');

const log = createLogger('LEAVE');

// Try to use multi-bot service, fall back to local voiceManager
async function getPlaybackService() {
  try {
    const { MultiBotService } = require('@rainbot/utils');
    if (MultiBotService.isInitialized()) {
      return { type: 'multibot', service: MultiBotService.getInstance() };
    }
  } catch {
    // Multi-bot service not available
  }

  // Fall back to local voiceManager
  const voiceManager = require('@rainbot/utils');
  return { type: 'local', service: voiceManager };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the current voice channel (playback and queue will stop)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      // Multi-bot architecture
      const status = await service.getStatus(guildId);

      if (!status || !status.isConnected) {
        return interaction.reply({
          content:
            "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const channelName = status.channelName || 'the channel';
        await service.leaveChannel(guildId);
        log.info(`Left voice in ${interaction.guild.name}`);
        await interaction.reply(`👋 Left **${channelName}**! The queue has been cleared.`);
      } catch (error) {
        log.error(`Error leaving voice channel: ${error.message}`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: `❌ Failed to leave the voice channel: ${error.message}`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: `❌ Failed to leave the voice channel: ${error.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    } else {
      // Local voiceManager fallback
      const voiceManager = service;
      const status = voiceManager.getStatus(guildId);

      if (!status) {
        return interaction.reply({
          content:
            "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const channelName = status.channelName;
        voiceManager.leaveChannel(guildId);
        log.info(`Left ${channelName} in ${interaction.guild.name}`);
        await interaction.reply(`👋 Left **${channelName}**! The queue has been cleared.`);
      } catch (error) {
        log.error(`Error leaving voice channel: ${error.message}`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: `❌ Failed to leave the voice channel: ${error.message}`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: `❌ Failed to leave the voice channel: ${error.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }
  },
};
