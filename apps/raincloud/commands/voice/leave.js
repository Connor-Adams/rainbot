/**
 * Leave command - Multi-bot architecture version
 * Disconnects all worker bots from voice channel
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { getMultiBotService, createWorkerUnavailableResponse } = require('../utils/commandHelpers');

const log = createLogger('LEAVE');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the current voice channel (playback and queue will stop)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(createWorkerUnavailableResponse());
    }

    // Multi-bot architecture
    const status = await service.getStatus(guildId);

    if (!status || !status.connected) {
      return interaction.reply({
        content:
          "âŒ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const channelName = status.channelName || 'the channel';
      await service.leaveChannel(guildId);
      log.info(`Left voice in ${interaction.guild.name}`);
      await interaction.reply(`ðŸ‘‹ Left **${channelName}**! The queue has been cleared.`);
    } catch (error) {
      log.error(`Error leaving voice channel: ${error.message}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `âŒ Failed to leave the voice channel: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: `âŒ Failed to leave the voice channel: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
