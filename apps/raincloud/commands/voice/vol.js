/**
 * Volume command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('VOLUME');

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
    .setName('vol')
    .setDescription('Get or set the playback volume')
    .addIntegerOption((option) =>
      option.setName('level').setDescription('Volume level (1–100)').setMinValue(1).setMaxValue(100)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const level = interaction.options.getInteger('level');
    const user = interaction.user.tag;
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      const status = await service.getStatus(guildId);
      if (!status || !status.isConnected) {
        return interaction.reply({
          content: "❌ I'm not in a voice channel! Use `/join` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (level === null) {
        // Get current volume - not yet implemented in multi-bot
        return interaction.reply({
          content: `🔊 Volume controls are available. Use \`/vol <1-100>\` to set volume.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const result = await service.setVolume(guildId, level);

        if (result.success) {
          log.info(`Volume set to ${level}% by ${user}`);
          await interaction.reply({
            content: `🔊 Volume set to **${level}%**`,
          });
        } else {
          await interaction.reply({
            content: `❌ Failed to set volume: ${result.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        log.error(`Failed to set volume: ${error.message}`);
        await interaction.reply(createErrorResponse(error, 'Failed to set volume'));
      }
    } else {
      // Local voiceManager fallback
      const voiceManager = service;
      const connectionCheck = validateVoiceConnection(interaction, voiceManager);
      if (!connectionCheck.isValid) {
        return interaction.reply(connectionCheck.error);
      }

      const status = voiceManager.getStatus(guildId);
      if (level === null) {
        return interaction.reply({
          content: `🔊 Current volume is **${status.volume}%**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        voiceManager.setVolume(guildId, level);
        log.info(`Volume set to ${level}% by ${user}`);

        await interaction.reply({
          content: `🔊 Volume set to **${level}%**`,
        });
      } catch (error) {
        log.error(`Failed to set volume: ${error.message}`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(createErrorResponse(error, 'Failed to set volume'));
        } else {
          await interaction.reply(createErrorResponse(error, 'Failed to set volume'));
        }
      }
    }
  },
};
