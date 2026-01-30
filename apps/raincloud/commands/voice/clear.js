/**
 * Clear command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const {
  getMultiBotService,
  createWorkerUnavailableResponse,
  createErrorResponse,
} = require('../utils/commandHelpers');

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
      return interaction.reply(createWorkerUnavailableResponse());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply({
        content: "I'm not in a voice channel! Use `/join` first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const queueResult = await service.getQueueInfo(guildId);
    const totalInQueue = queueResult.success ? queueResult.queue?.queue?.length || 0 : 0;

    if (totalInQueue === 0) {
      return interaction.reply('Queue is already empty.');
    }

    // If confirmation is skipped or there are 3 or fewer tracks, clear immediately
    if (skipConfirm || totalInQueue <= 3) {
      try {
        const result = await service.clearQueue(guildId);

        if (result.success) {
          log.info(`Cleared queue by ${interaction.user.tag}`);
          const nowPlaying = status.queue?.nowPlaying?.title ?? null;
          const currentTrack = nowPlaying ? `\n\nStill playing: **${nowPlaying}**` : '';

          await interaction.reply(`Cleared the queue.${currentTrack}`);
        } else {
          await interaction.reply({
            content: `Failed to clear queue: ${result.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (error) {
        log.error(`Clear error: ${error.message}`);
        return interaction.reply(createErrorResponse(error));
      }
    } else {
      // Show confirmation dialog for large queues
      try {
        const { createConfirmationRow } = require('../../dist/components');

        await interaction.reply({
          content:
            `Warning: You are about to clear **${totalInQueue}** track${totalInQueue === 1 ? '' : 's'} from the queue.\n\n` +
            `This action cannot be undone. Are you sure?\n\n` +
            `Tip: Use \`/clear confirm:true\` to skip this confirmation.`,
          components: [createConfirmationRow('clear_queue', guildId, interaction.user.id)],
          ephemeral: true,
        });
      } catch {
        // Fallback if confirmation buttons aren't available
        const result = await service.clearQueue(guildId);
        if (result.success) {
          await interaction.reply('Cleared the queue.');
        } else {
          await interaction.reply({
            content: `Failed to clear queue: ${result.message}`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }
  },
};
