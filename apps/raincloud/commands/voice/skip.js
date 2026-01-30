/**
 * Skip command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const {
  getMultiBotService,
  createWorkerUnavailableResponse,
  createErrorResponse,
} = require('../utils/commandHelpers');

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
      const skipped = await service.skip(guildId, count);

      if (skipped.length === 0) {
        return interaction.reply({
          content: 'âŒ Nothing is playing right now.',
          flags: MessageFlags.Ephemeral,
        });
      }

      log.info(`Skipped ${skipped.length} track(s) by ${interaction.user.tag}`);

      const queueInfo = await service.getQueue(guildId);
      const nextUp = queueInfo.queue[0]?.title || 'Nothing';

      let replyText = '';
      if (skipped.length === 1) {
        replyText = `â­ï¸ Skipped: **${skipped[0]}**`;
      } else {
        replyText = `â­ï¸ Skipped **${skipped.length}** tracks:\n${skipped.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      }

      replyText += `\n\nâ–¶ï¸ Up next: **${nextUp}**`;

      await interaction.reply(replyText);
    } catch (error) {
      log.error(`Skip error: ${error.message}`);
      await interaction.reply(createErrorResponse(error));
    }
  },
};
