/**
 * Clear command - Multi-bot architecture version
 */
const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { getMultiBotService } = require('../utils/commandHelpers');
const {
  replySuccess,
  replyError,
  replyNotInVoice,
  replyWorkerUnavailable,
  replyConfirm,
} = require('../utils/responseBuilder');

const log = createLogger('CLEAR');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription(
      'Clear the music queue while keeping the current track playing (use /stop to stop everything)'
    )
    .addBooleanOption((option) =>
      option
        .setName('confirm')
        .setDescription('Skip confirmation and clear immediately (default: false)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const skipConfirm = interaction.options.getBoolean('confirm') || false;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(replyWorkerUnavailable());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply(replyNotInVoice());
    }

    const queueResult = await service.getQueueInfo(guildId);
    const totalInQueue = queueResult.success ? queueResult.queue?.queue?.length || 0 : 0;

    if (totalInQueue === 0) {
      return interaction.reply(replySuccess('Queue is already empty.'));
    }

    if (skipConfirm || totalInQueue <= 3) {
      try {
        const result = await service.clearQueue(guildId);

        if (result.success) {
          log.info(`Cleared queue by ${interaction.user.tag}`);
          const nowPlaying = status.queue?.nowPlaying?.title ?? null;
          const currentTrack = nowPlaying ? `\n\nStill playing: **${nowPlaying}**` : '';
          await interaction.reply(replySuccess(`Cleared the queue.${currentTrack}`));
        } else {
          await interaction.reply(replyError(result.message || 'Failed to clear queue'));
        }
      } catch (error) {
        log.error(`Clear error: ${error.message}`);
        return interaction.reply(replyError(error));
      }
    } else {
      try {
        const { createConfirmationRow } = require('../../dist/components');
        const content =
          `Warning: You are about to clear **${totalInQueue}** track${totalInQueue === 1 ? '' : 's'} from the queue.\n\n` +
          `This action cannot be undone. Are you sure?\n\n` +
          `Tip: Use \`/clear confirm:true\` to skip this confirmation.`;
        await interaction.reply(
          replyConfirm(content, [
            createConfirmationRow('clear_queue', guildId, interaction.user.id),
          ])
        );
      } catch {
        const result = await service.clearQueue(guildId);
        if (result.success) {
          await interaction.reply(replySuccess('Cleared the queue.'));
        } else {
          await interaction.reply(replyError(result.message || 'Failed to clear queue'));
        }
      }
    }
  },
};
