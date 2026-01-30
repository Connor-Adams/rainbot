/**
 * Skip command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('SKIP');

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

  // Fall back to local voiceManager
  const voiceManager = require('../../dist/utils/voiceManager');
  return { type: 'local', service: voiceManager };
}

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
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      const status = await service.getStatus(guildId);
      if (!status || !status.connected) {
        return interaction.reply({
          content: "❌ I'm not in a voice channel! Use `/join` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const skipped = await service.skip(guildId, count);

        if (skipped.length === 0) {
          return interaction.reply({
            content: '❌ Nothing is playing right now.',
            flags: MessageFlags.Ephemeral,
          });
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

        await interaction.reply(replyText);
      } catch (error) {
        log.error(`Skip error: ${error.message}`);
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
        const skipped = await voiceManager.skip(guildId, count);

        if (skipped.length === 0) {
          return interaction.reply({
            content: '❌ Nothing is playing right now.',
            flags: MessageFlags.Ephemeral,
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
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(createErrorResponse(error));
        } else {
          await interaction.reply(createErrorResponse(error));
        }
      }
    }
  },
};
