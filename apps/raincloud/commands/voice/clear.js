/**
 * Clear command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('CLEAR');

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

  const voiceManager = require('../../dist/utils/voiceManager');
  return { type: 'local', service: voiceManager };
}

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
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      const status = await service.getStatus(guildId);
      if (!status || !status.isConnected) {
        return interaction.reply({
          content: "❌ I'm not in a voice channel! Use `/join` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const queueResult = await service.getQueueInfo(guildId);
      const totalInQueue = queueResult.success
        ? queueResult.queue?.length || queueResult.totalInQueue || 0
        : 0;

      if (totalInQueue === 0) {
        return interaction.reply('📋 Queue is already empty.');
      }

      // If confirmation is skipped or there are 3 or fewer tracks, clear immediately
      if (skipConfirm || totalInQueue <= 3) {
        try {
          const result = await service.clearQueue(guildId);

          if (result.success) {
            log.info(`Cleared queue by ${interaction.user.tag}`);
            const nowPlaying = status.nowPlaying;
            const currentTrack = nowPlaying ? `\n\n▶️ Still playing: **${nowPlaying}**` : '';

            await interaction.reply(`🗑️ Cleared the queue.${currentTrack}`);
          } else {
            await interaction.reply({
              content: `❌ Failed to clear queue: ${result.message}`,
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
              `⚠️ You are about to clear **${totalInQueue}** track${totalInQueue === 1 ? '' : 's'} from the queue.\n\n` +
              `This action cannot be undone. Are you sure?\n\n` +
              `💡 *Tip: Use \`/clear confirm:true\` to skip this confirmation.*`,
            components: [createConfirmationRow('clear_queue', guildId, interaction.user.id)],
            ephemeral: true,
          });
        } catch {
          // Fallback if confirmation buttons aren't available
          const result = await service.clearQueue(guildId);
          if (result.success) {
            await interaction.reply('🗑️ Cleared the queue.');
          } else {
            await interaction.reply({
              content: `❌ Failed to clear queue: ${result.message}`,
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      }
    } else {
      // Local voiceManager fallback
      const voiceManager = service;
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
          const { createConfirmationRow } = require('../../dist/components');

          await interaction.reply({
            content:
              `⚠️ You are about to clear **${totalInQueue}** track${totalInQueue === 1 ? '' : 's'} from the queue.\n\n` +
              `This action cannot be undone. Are you sure?\n\n` +
              `💡 *Tip: Use \`/clear confirm:true\` to skip this confirmation.*`,
            components: [createConfirmationRow('clear_queue', guildId, interaction.user.id)],
            ephemeral: true,
          });
        } catch {
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
    }
  },
};
