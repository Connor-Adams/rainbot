/**
 * Leave command - Multi-bot architecture version
 * Disconnects all worker bots from voice channel
 */
const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { getMultiBotService } = require('../utils/commandHelpers');
const {
  replySuccess,
  replyError,
  replyNotInVoice,
  replyWorkerUnavailable,
} = require('../utils/responseBuilder');

const log = createLogger('LEAVE');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the current voice channel (playback and queue will stop)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(replyWorkerUnavailable());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply(replyNotInVoice());
    }

    try {
      const channelName = status.channelName || 'the channel';
      await service.leaveChannel(guildId);
      log.info(`Left voice in ${interaction.guild.name}`);
      await interaction.reply(
        replySuccess(`👋 Left **${channelName}**! The queue has been cleared.`)
      );
    } catch (error) {
      log.error(`Error leaving voice channel: ${error.message}`);
      const payload = replyError(error, 'Failed to leave the voice channel');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  },
};
