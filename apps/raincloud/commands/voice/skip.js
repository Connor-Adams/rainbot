/**
 * Skip command - Multi-bot architecture version
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

const log = createLogger('SKIP');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track or multiple tracks from the queue')
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('Number of tracks to skip (default: 1)')
        .setMinValue(1)
        .setMaxValue(10)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const count = interaction.options.getInteger('count') || 1;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(replyWorkerUnavailable());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply(replyNotInVoice());
    }

    try {
      const skipped = await service.skip(guildId, count);

      if (skipped.length === 0) {
        return interaction.reply(replyPayload({ content: NOTHING_PLAYING, ephemeral: true }));
      }

      log.info(`Skipped ${skipped.length} track(s) by ${interaction.user.tag}`);

      const queueInfo = await service.getQueue(guildId);
      const nextUp = queueInfo.queue[0]?.title || 'Nothing';

      let replyText = '';
      if (skipped.length === 1) {
        replyText = `⏭️ Skipped: **${skipped[0]}**`;
      } else {
        replyText = `⏭️ Skipped **${skipped.length}** tracks:\n${skipped.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      }

      replyText += `\n\n▶️ Up next: **${nextUp}**`;

      await interaction.reply(replySuccess(replyText));
    } catch (error) {
      log.error(`Skip error: ${error.message}`);
      await interaction.reply(replyError(error));
    }
  },
};
