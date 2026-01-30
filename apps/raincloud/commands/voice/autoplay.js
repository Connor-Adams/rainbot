/**
 * Autoplay command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const {
  getMultiBotService,
  createWorkerUnavailableResponse,
} = require('../utils/commandHelpers');

const log = createLogger('AUTOPLAY');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription(
      'Toggle auto keep playing mode (automatically plays related tracks when queue is empty)'
    )
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('Enable or disable autoplay').setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const user = interaction.user.tag;
    const enabledOption = interaction.options.getBoolean('enabled');
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

    try {
      const result = await service.toggleAutoplay(guildId, enabledOption);

      if (result.success) {
        const emoji = result.enabled ? 'ðŸ”' : 'â¹ï¸';
        const statusText = result.enabled ? 'enabled' : 'disabled';

        log.info(`Autoplay ${statusText} by ${user} in ${interaction.guild.name}`);

        await interaction.reply({
          content: `${emoji} Autoplay ${statusText}${result.enabled ? '! The bot will automatically play related tracks when the queue is empty.' : '.'}`,
        });
      } else {
        await interaction.reply({
          content: `âŒ Failed to toggle autoplay: ${result.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      log.error(`Failed to toggle autoplay: ${error.message}`);
      await interaction.reply({
        content: `âŒ Failed to toggle autoplay: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

