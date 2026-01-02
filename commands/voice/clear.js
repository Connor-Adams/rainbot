const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('CLEAR');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription(
      'Clear the music queue while keeping the current track playing (use /stop to stop everything)'
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const connectionCheck = validateVoiceConnection(interaction, voiceManager);
    if (!connectionCheck.isValid) {
      return interaction.reply(connectionCheck.error);
    }

    try {
      const cleared = voiceManager.clearQueue(guildId);
      log.info(`Cleared ${cleared} tracks by ${interaction.user.tag}`);

      const { nowPlaying } = voiceManager.getQueue(guildId);
      const currentTrack = nowPlaying ? `\n\n▶️ Still playing: **${nowPlaying}**` : '';

      if (cleared === 0) {
        await interaction.reply(`📋 Queue was already empty.${currentTrack}`);
      } else {
        await interaction.reply(
          `🗑️ Cleared **${cleared}** track${cleared === 1 ? '' : 's'} from the queue.${currentTrack}`
        );
      }
    } catch (error) {
      log.error(`Clear error: ${error.message}`);
      // Check if we already replied
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(createErrorResponse(error));
      } else {
        await interaction.reply(createErrorResponse(error));
      }
    }
  },
};
