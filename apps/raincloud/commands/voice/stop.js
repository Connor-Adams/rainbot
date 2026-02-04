/**
 * Stop command - Multi-bot architecture version
 */
const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { getMultiBotService } = require('../utils/commandHelpers');
const {
  replySuccess,
  replyError,
  replyNotInVoice,
  replyWorkerUnavailable,
  replyPayload,
  NOTHING_PLAYING,
} = require('../utils/responseBuilder');

const log = createLogger('STOP');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription(
      'Stop playback immediately and clear the entire queue (use /clear to keep current track)'
    ),

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
      const stopped = await service.stop(guildId);

      if (stopped) {
        log.info(`Stopped by ${interaction.user.tag}`);
        await interaction.reply(replySuccess('⏹️ Stopped playback and cleared the queue.'));
      } else {
        await interaction.reply(replyPayload({ content: NOTHING_PLAYING, ephemeral: true }));
      }
    } catch (error) {
      log.error(`Stop error: ${error.message}`);
      await interaction.reply(replyError(error));
    }
  },
};
