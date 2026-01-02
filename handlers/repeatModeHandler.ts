/**
 * Handlers for repeat mode select menu
 */

import { MessageFlags } from 'discord.js';
import type { SelectMenuHandler, RepeatMode } from '../types/select-menus';
import { createLogger } from '../utils/logger';
import {
  validateRepeatMode,
  getRepeatModeDescription,
  getRepeatModeEmoji,
} from '../components/select-menus/string/repeatModeMenu';

const log = createLogger('REPEAT_MODE_HANDLER');

/**
 * Handler for repeat mode selection
 */
export const repeatModeHandler: SelectMenuHandler = async (interaction, context) => {
  try {
    // Ensure it's a string select menu
    if (!interaction.isStringSelectMenu()) {
      return {
        success: false,
        error: 'Invalid interaction type',
      };
    }

    const selectedMode = interaction.values[0];

    if (!selectedMode) {
      await interaction.reply({
        content: '❌ No repeat mode selected',
        flags: MessageFlags.Ephemeral,
      });
      return {
        success: false,
        error: 'No mode selected',
      };
    }

    // Validate the selection
    const validation = validateRepeatMode(selectedMode);
    if (!validation.valid) {
      await interaction.reply({
        content: `❌ ${validation.error}`,
        flags: MessageFlags.Ephemeral,
      });
      return {
        success: false,
        error: validation.error,
      };
    }

    const mode = validation.mode as RepeatMode;
    const emoji = getRepeatModeEmoji(mode);
    const description = getRepeatModeDescription(mode);

    // Apply repeat mode (this would integrate with the voice system in a real implementation)
    await interaction.reply({
      content: `${emoji} Repeat mode set to **${mode}**\n\n${description}`,
      flags: MessageFlags.Ephemeral,
    });

    log.info(`Repeat mode set to ${mode} for guild ${context.guildId} by ${interaction.user.tag}`);

    return {
      success: true,
      data: { mode },
    };
  } catch (error) {
    log.error(`Error handling repeat mode selection: ${error}`);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await interaction
      .reply({
        content: `❌ Failed to set repeat mode: ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});

    return {
      success: false,
      error: errorMessage,
    };
  }
};
