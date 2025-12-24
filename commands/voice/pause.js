const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('PAUSE');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Toggle pause/resume playback (pauses if playing, resumes if paused)'),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const connectionCheck = validateVoiceConnection(interaction, voiceManager);
    if (!connectionCheck.isValid) {
      return interaction.reply(connectionCheck.error);
    }

    try {
      const result = voiceManager.togglePause(guildId);

      if (result.paused) {
        log.info(`Paused by ${interaction.user.tag}`);
        const { nowPlaying } = voiceManager.getQueue(guildId);
        const trackInfo = nowPlaying ? ` **${nowPlaying}**` : '';
        await interaction.reply(`⏸️ Paused playback${trackInfo}.`);
      } else {
        log.info(`Resumed by ${interaction.user.tag}`);
        const { nowPlaying } = voiceManager.getQueue(guildId);
        const trackInfo = nowPlaying ? ` **${nowPlaying}**` : '';
        await interaction.reply(`▶️ Resumed playback${trackInfo}.`);
      }
    } catch (error) {
      log.error(`Pause error: ${error.message}`);
      await interaction.reply(
        createErrorResponse(error, '', '💡 **Tip:** Make sure something is playing before trying to pause.')
      );
    }
  },
};
