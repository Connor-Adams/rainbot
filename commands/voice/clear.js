const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

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

    const connectionCheck = validateVoiceConnection(interaction, voiceManager);
    if (!connectionCheck.isValid) {
      return interaction.reply(connectionCheck.error);
    }

    const { totalInQueue } = voiceManager.getQueue(guildId);

    // If queue is empty, no need for confirmation
    if (totalInQueue === 0) {
      return interaction.reply('📋 Queue is already empty.');
    }

    // If confirmation is skipped or there are 3 or fewer tracks, clear immediately
    if (skipConfirm || totalInQueue <= 3) {
      try {
        const cleared = voiceManager.clearQueue(guildId);
        log.info(`Cleared ${cleared} tracks by ${interaction.user.tag}`);

        const { nowPlaying } = voiceManager.getQueue(guildId);
        const currentTrack = nowPlaying ? `\n\n▶️ Still playing: **${nowPlaying}**` : '';

        await interaction.reply(
          `🗑️ Cleared **${cleared}** track${cleared === 1 ? '' : 's'} from the queue.${currentTrack}`
        );
      } catch (error) {
        log.error(`Clear error: ${error.message}`);
        return interaction.reply(createErrorResponse(error));
      }
    } else {
      // Show confirmation dialog for large queues
      try {
        const { createConfirmationRow, getConfirmationMessage } = require('../../dist/components');

        await interaction.reply({
          content:
            `⚠️ You are about to clear **${totalInQueue}** track${totalInQueue === 1 ? '' : 's'} from the queue.\n\n` +
            `This action cannot be undone. Are you sure?\n\n` +
            `💡 *Tip: Use \`/clear confirm:true\` to skip this confirmation.*`,
          components: [createConfirmationRow('clear_queue', guildId, interaction.user.id)],
          ephemeral: true,
        });
      } catch (error) {
        // Fallback if confirmation buttons aren't available
        log.warn('Confirmation buttons not available, clearing without confirmation');
        try {
          const cleared = voiceManager.clearQueue(guildId);
          const { nowPlaying } = voiceManager.getQueue(guildId);
          const currentTrack = nowPlaying ? `\n\n▶️ Still playing: **${nowPlaying}**` : '';

          await interaction.reply(
            `🗑️ Cleared **${cleared}** track${cleared === 1 ? '' : 's'} from the queue.${currentTrack}`
          );
        } catch (clearError) {
          log.error(`Clear error: ${clearError.message}`);
          return interaction.reply(createErrorResponse(clearError));
        }
      }
    }
  },
};
