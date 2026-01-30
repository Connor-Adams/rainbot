/**
 * Autoplay command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('AUTOPLAY');

// Try to use multi-bot service, fall back to local voiceManager
async function getPlaybackService() {
  try {
    const { MultiBotService } = require('../../dist/lib/multiBotService');
    if (MultiBotService.isInitialized()) {
      return { type: 'multibot', service: MultiBotService.getInstance() };
    }
  } catch {
    // Multi-bot service not available
  }

  const voiceManager = require('../../dist/utils/voiceManager');
  return { type: 'local', service: voiceManager };
}

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
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      const status = await service.getStatus(guildId);
      if (!status || !status.connected) {
        return interaction.reply({
          content: "❌ I'm not in a voice channel! Use `/join` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const result = await service.toggleAutoplay(guildId, enabledOption);

        if (result.success) {
          const emoji = result.enabled ? '🔁' : '⏹️';
          const statusText = result.enabled ? 'enabled' : 'disabled';

          log.info(`Autoplay ${statusText} by ${user} in ${interaction.guild.name}`);

          await interaction.reply({
            content: `${emoji} Autoplay ${statusText}${result.enabled ? '! The bot will automatically play related tracks when the queue is empty.' : '.'}`,
          });
        } else {
          await interaction.reply({
            content: `❌ Failed to toggle autoplay: ${result.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        log.error(`Failed to toggle autoplay: ${error.message}`);
        await interaction.reply({
          content: `❌ Failed to toggle autoplay: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
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
    }
  },
};
