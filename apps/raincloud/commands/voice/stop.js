const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('STOP');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription(
      'Stop playback immediately and clear the entire queue (use /clear to keep current track)'
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

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
      // Check if we already replied
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(createErrorResponse(error));
      } else {
        await interaction.reply(createErrorResponse(error));
      }
    }
  },
};
