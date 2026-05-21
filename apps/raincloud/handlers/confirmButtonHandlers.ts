/**
 * Confirmation button handlers
 */

import { MessageFlags } from 'discord.js';
import type { ButtonHandler } from '@rainbot/protocol';
import { createLogger } from '@rainbot/utils/logger';
import MultiBotService, { getMultiBotService } from '../lib/multiBotService';

const log = createLogger('CONFIRM_BUTTONS');

/**
 * Handle confirm button for various actions
 */
export const handleConfirmButton: ButtonHandler = async (interaction, context) => {
  const { guildId, userId, metadata } = context;
  const action = metadata?.['action'] as string;

  // Verify user authorization
  if (userId && userId !== interaction.user.id) {
    await interaction.reply({
      content: '❌ This confirmation is not for you!',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Unauthorized user' };
  }

  try {
    const multiBot = MultiBotService.isInitialized() ? getMultiBotService() : null;
    if (!multiBot) {
      await interaction.update({
        content: '❌ Worker services are not ready.',
        components: [],
      });
      return { success: false, error: 'Workers unavailable' };
    }

    switch (action) {
      case 'clear_queue': {
        if (!guildId) {
          await interaction.update({
            content: '❌ Guild ID not found',
            components: [],
          });
          return { success: false, error: 'No guild ID' };
        }

        const status = await multiBot.getStatus(guildId);
        if (!status) {
          await interaction.update({
            content: "❌ I'm not in a voice channel anymore!",
            components: [],
          });
          return { success: false, error: 'Bot not in voice channel' };
        }

        const result = await multiBot.clearQueue(guildId);
        if (!result.success) {
          await interaction.update({
            content: `❌ Failed to clear queue: ${result.message || 'Unknown error'}`,
            components: [],
          });
          return { success: false, error: result.message || 'Failed to clear queue' };
        }
        const cleared = result.cleared ?? 0;
        const nowPlaying = status.queue?.nowPlaying?.title ?? null;
        const currentTrack = nowPlaying ? `\n\n▶️ Still playing: **${nowPlaying}**` : '';

        await interaction.update({
          content: `🗑️ Cleared **${cleared}** track${cleared === 1 ? '' : 's'} from the queue.${currentTrack}`,
          components: [],
        });

        log.info(`Cleared ${cleared} tracks via confirmation by ${interaction.user.tag}`);
        return { success: true, data: { cleared } };
      }

      case 'stop_playback': {
        if (!guildId) {
          await interaction.update({
            content: '❌ Guild ID not found',
            components: [],
          });
          return { success: false, error: 'No guild ID' };
        }

        await multiBot.stop(guildId);

        await interaction.update({
          content: '⏹️ Playback stopped and queue cleared.',
          components: [],
        });

        log.info(`Stopped playback via confirmation by ${interaction.user.tag}`);
        return { success: true };
      }

      case 'leave_channel': {
        if (!guildId) {
          await interaction.update({
            content: '❌ Guild ID not found',
            components: [],
          });
          return { success: false, error: 'No guild ID' };
        }

        await multiBot.leaveChannel(guildId);
        await interaction.update({
          content: '👋 Left the voice channel.',
          components: [],
        });
        log.info(`Left channel via confirmation by ${interaction.user.tag}`);
        return { success: true };
      }

      default:
        await interaction.update({
          content: `❌ Unknown action: ${action}`,
          components: [],
        });
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    log.error(`Confirm button error: ${error}`);
    await interaction
      .update({
        content: `❌ ${error instanceof Error ? error.message : 'Unknown error'}`,
        components: [],
      })
      .catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Handle cancel button
 */
export const handleCancelButton: ButtonHandler = async (interaction, context) => {
  const { userId } = context;

  // Verify user authorization
  if (userId && userId !== interaction.user.id) {
    await interaction.reply({
      content: '❌ This confirmation is not for you!',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'Unauthorized user' };
  }

  try {
    await interaction.update({
      content: '❌ Cancelled.',
      components: [],
    });

    return { success: true };
  } catch (error) {
    log.error(`Cancel button error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
