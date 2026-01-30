/**
 * Volume command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const {
  getMultiBotService,
  createWorkerUnavailableResponse,
  createErrorResponse,
} = require('../utils/commandHelpers');

const log = createLogger('VOLUME');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vol')
    .setDescription('Get or set the playback volume')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Volume level (1â€“100)')
        .setMinValue(1)
        .setMaxValue(100)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const level = interaction.options.getInteger('level');
    const user = interaction.user.tag;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(createWorkerUnavailableResponse());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply({
        content: "âŒ I'm not in a voice channel! Use `/join` first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (level === null) {
      // Get current volume - not yet implemented in multi-bot
      return interaction.reply({
        content: `ðŸ”Š Volume controls are available. Use \`/vol <1-100>\` to set volume.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const result = await service.setVolume(guildId, level);

      if (result.success) {
        log.info(`Volume set to ${level}% by ${user}`);
        await interaction.reply({
          content: `ðŸ”Š Volume set to **${level}%**`,
        });
      } else {
        await interaction.reply({
          content: `âŒ Failed to set volume: ${result.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      log.error(`Failed to set volume: ${error.message}`);
      await interaction.reply(createErrorResponse(error, 'Failed to set volume'));
    }
  },
};
