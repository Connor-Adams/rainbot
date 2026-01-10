/**
 * Confirmation button handlers
 */

import { MessageFlags } from 'discord.js';
import type { ButtonHandler } from '../types/buttons.ts';
import { createLogger } from '../utils/logger.ts';
import * as voiceManager from '../utils/voiceManager.ts';

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
    switch (action) {
      case 'clear_queue': {
        if (!guildId) {
          await interaction.update({
            content: '❌ Guild ID not found',
            components: [],
          });
          return { success: false, error: 'No guild ID' };
        }

        const status = voiceManager.getStatus(guildId);
        if (!status) {
          await interaction.update({
            content: "❌ I'm not in a voice channel anymore!",
            components: [],
          });
          return { success: false, error: 'Bot not in voice channel' };
        }

        const cleared = await voiceManager.clearQueue(guildId);
        const { nowPlaying } = voiceManager.getQueue(guildId);
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

        voiceManager.stopSound(guildId);

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

        const left = voiceManager.leaveChannel(guildId);
        if (left) {
          await interaction.update({
            content: '👋 Left the voice channel.',
            components: [],
          });
          log.info(`Left channel via confirmation by ${interaction.user.tag}`);
          return { success: true };
        } else {
          await interaction.update({
            content: "❌ I'm not in a voice channel.",
            components: [],
          });
          return { success: false, error: 'Not in channel' };
        }
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
