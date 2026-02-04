/**
 * Pause command - Multi-bot architecture version
 */
const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { getMultiBotService } = require('../utils/commandHelpers');
const {
  replySuccess,
  replyError,
  replyNotInVoice,
  replyWorkerUnavailable,
} = require('../utils/responseBuilder');

const log = createLogger('PAUSE');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Toggle pause/resume playback (pauses if playing, resumes if paused)'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(replyWorkerUnavailable());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply(replyNotInVoice());
    }

    try {
      const result = await service.togglePause(guildId);
      const queueInfo = await service.getQueue(guildId);
      const trackInfo = queueInfo.nowPlaying?.title ? ` **${queueInfo.nowPlaying.title}**` : '';

      if (result.paused) {
        log.info(`Paused by ${interaction.user.tag}`);
        await interaction.reply(replySuccess(`⏸️ Paused playback${trackInfo}.`));
      } else {
        log.info(`Resumed by ${interaction.user.tag}`);
        await interaction.reply(replySuccess(`▶️ Resumed playback${trackInfo}.`));
      }
    } catch (error) {
      log.error(`Pause error: ${error.message}`);
      await interaction.reply(
        replyError(error, '', '💡 **Tip:** Make sure something is playing before trying to pause.')
      );
    }
  },
};
