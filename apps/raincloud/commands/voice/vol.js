/**
 * Volume command - Multi-bot architecture version
 */
const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { getMultiBotService } = require('../utils/commandHelpers');
const {
  replySuccess,
  replyError,
  replyNotInVoice,
  replyWorkerUnavailable,
  replyPayload,
} = require('../utils/responseBuilder');

const log = createLogger('VOLUME');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vol')
    .setDescription('Get or set the playback volume')
    .addIntegerOption((option) =>
      option.setName('level').setDescription('Volume level (1–100)').setMinValue(1).setMaxValue(100)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const level = interaction.options.getInteger('level');
    const user = interaction.user.tag;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(replyWorkerUnavailable());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply(replyNotInVoice());
    }

    if (level === null) {
      return interaction.reply(
        replyPayload({
          content: `🔊 Volume controls are available. Use \`/vol <1-100>\` to set volume.`,
          ephemeral: true,
        })
      );
    }

    try {
      const result = await service.setVolumeForConnectedWorkers(guildId, level);

      if (result.success) {
        log.info(`Volume set to ${level}% by ${user}`);
        await interaction.reply(replySuccess(`🔊 Volume set to **${level}%**`));
      } else {
        await interaction.reply(replyError(result.message || 'Failed to set volume'));
      }
    } catch (error) {
      log.error(`Failed to set volume: ${error.message}`);
      await interaction.reply(replyError(error, 'Failed to set volume'));
    }
  },
};
