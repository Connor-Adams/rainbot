const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

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

    const connectionCheck = validateVoiceConnection(interaction, voiceManager);
    if (!connectionCheck.isValid) {
      return interaction.reply(connectionCheck.error);
    }

    try {
      const skipped = await voiceManager.skip(guildId, count);

      if (skipped.length === 0) {
        return interaction.reply({
          content: '❌ Nothing is playing right now.',
          ephemeral: true,
        });
      }

      log.info(`Skipped ${skipped.length} track(s) by ${interaction.user.tag}`);

      const queue = voiceManager.getQueue(guildId);
      const nextUp = queue.queue[0]?.title || 'Nothing';

      let replyText = '';
      if (skipped.length === 1) {
        replyText = `⏭️ Skipped: **${skipped[0]}**`;
      } else {
        replyText = `⏭️ Skipped **${skipped.length}** tracks:\n${skipped.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      }

      replyText += `\n\n▶️ Up next: **${nextUp}**`;

      await interaction.reply(replyText);
    } catch (error) {
      log.error(`Skip error: ${error.message}`);
      await interaction.reply(createErrorResponse(error));
    }
  },
};
