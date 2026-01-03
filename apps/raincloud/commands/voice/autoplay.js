const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');

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

    const status = voiceManager.getStatus(guildId);
    if (!status) {
      return interaction.reply({
        content:
          "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Toggle or set autoplay
      const result = voiceManager.toggleAutoplay(guildId, enabledOption);

      const emoji = result.enabled ? '🔁' : '⏹️';
      const statusText = result.enabled ? 'enabled' : 'disabled';

      log.info(`Autoplay ${statusText} by ${user} in ${interaction.guild.name}`);

      await interaction.reply({
        content: `${emoji} Autoplay ${statusText}${result.enabled ? '! The bot will automatically play related tracks when the queue is empty.' : '.'}`,
      });
    } catch (error) {
      log.error(`Failed to toggle autoplay: ${error.message}`);
      // Check if we already replied
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ Failed to toggle autoplay: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to toggle autoplay: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
