/**
 * Stop command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../utils/logger.ts');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers.js');

const log = createLogger('STOP');

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

  const voiceManager = require('../../utils/voiceManager.ts');
  return { type: 'local', service: voiceManager };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription(
      'Stop playback immediately and clear the entire queue (use /clear to keep current track)'
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      const status = await service.getStatus(guildId);
      if (!status || !status.isConnected) {
        return interaction.reply({
          content: "❌ I'm not in a voice channel! Use `/join` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const stopped = await service.stop(guildId);

        if (stopped) {
          log.info(`Stopped by ${interaction.user.tag}`);
          await interaction.reply('⏹️ Stopped playback and cleared the queue.');
        } else {
          await interaction.reply({
            content: '❌ Nothing is playing. Use `/play` to start playback.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        log.error(`Stop error: ${error.message}`);
        await interaction.reply(createErrorResponse(error));
      }
    } else {
      // Local voiceManager fallback
      const voiceManager = service;
      const connectionCheck = validateVoiceConnection(interaction, voiceManager);
      if (!connectionCheck.isValid) {
        return interaction.reply(connectionCheck.error);
      }

      try {
        const stopped = voiceManager.stopSound(guildId);

        if (stopped) {
          log.info(`Stopped by ${interaction.user.tag}`);
          await interaction.reply('⏹️ Stopped playback and cleared the queue.');
        } else {
          await interaction.reply({
            content: '❌ Nothing is playing. Use `/play` to start playback.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        log.error(`Stop error: ${error.message}`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(createErrorResponse(error));
        } else {
          await interaction.reply(createErrorResponse(error));
        }
      }
    }
  },
};
