/**
 * Pause command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const {
  getMultiBotService,
  createWorkerUnavailableResponse,
  createErrorResponse,
} = require('../utils/commandHelpers');

const log = createLogger('PAUSE');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Toggle pause/resume playback (pauses if playing, resumes if paused)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
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
      const result = await service.togglePause(guildId);
      const queueInfo = await service.getQueue(guildId);
      const trackInfo = queueInfo.nowPlaying?.title ? ` **${queueInfo.nowPlaying.title}**` : '';

      if (result.paused) {
        log.info(`Paused by ${interaction.user.tag}`);
        await interaction.reply(`â¸ï¸ Paused playback${trackInfo}.`);
      } else {
        log.info(`Resumed by ${interaction.user.tag}`);
        await interaction.reply(`â–¶ï¸ Resumed playback${trackInfo}.`);
      }
    } catch (error) {
      log.error(`Pause error: ${error.message}`);
      await interaction.reply(
        createErrorResponse(
          error,
          '',
          'ðŸ’¡ **Tip:** Make sure something is playing before trying to pause.'
        )
      );
    }
  },
};

