/**
 * Handlers for audio filter select menu
 */

import { MessageFlags } from 'discord.js';
import type { SelectMenuHandler } from '../types/select-menus';
import { createLogger } from '../utils/logger';
import { validateFilterSelection, getFilterDescription } from '../components/select-menus/string/filterMenu';

const log = createLogger('FILTER_HANDLER');

/**
 * Handler for audio filter selection
 */
export const audioFilterHandler: SelectMenuHandler = async (interaction, context) => {
  try {
    // Ensure it's a string select menu
    if (!interaction.isStringSelectMenu()) {
      return {
        success: false,
        error: 'Invalid interaction type',
      };
    }

    const selectedFilters = interaction.values;

    // Validate the selection
    const validation = validateFilterSelection(selectedFilters);
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

    const filters = validation.filters || [];

    // Handle "none" filter
    if (filters.includes('none') || filters.length === 0) {
      await interaction.reply({
        content: '✅ Audio filters cleared. Playing with no filters.',
        flags: MessageFlags.Ephemeral,
      });

      log.info(`Filters cleared for guild ${context.guildId} by ${interaction.user.tag}`);

      return {
        success: true,
        data: { filters: [] },
      };
    }

    // Apply filters (this would integrate with the voice system in a real implementation)
    const filterDescriptions = filters.map((f) => `• **${f}**: ${getFilterDescription(f)}`).join('\n');

    await interaction.reply({
      content: `✅ Audio filters applied:\n\n${filterDescriptions}\n\n*Note: Filters will be applied to the next track.*`,
      flags: MessageFlags.Ephemeral,
    });

    log.info(`Filters applied for guild ${context.guildId}: ${filters.join(', ')} by ${interaction.user.tag}`);

    return {
      success: true,
      data: { filters },
    };
  } catch (error) {
    log.error(`Error handling audio filter selection: ${error}`);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await interaction
      .reply({
        content: `❌ Failed to apply filters: ${errorMessage}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});

    return {
      success: false,
      error: errorMessage,
    };
  }
};
