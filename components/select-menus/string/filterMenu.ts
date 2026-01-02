/**
 * Audio filter select menu component
 */

import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import type { AudioFilter, SelectMenuOption } from '../../../types/select-menus';
import { createStringSelectMenu, createSelectMenuId } from '../../builders/selectMenuBuilder';

/**
 * Get filter options for the select menu
 */
export function getFilterOptions(): SelectMenuOption[] {
  return [
    {
      label: 'None',
      value: 'none',
      description: 'No audio filter',
      emoji: '❌',
    },
    {
      label: 'Bass Boost',
      value: 'bassboost',
      description: 'Enhance bass frequencies',
      emoji: '🔊',
    },
    {
      label: 'Nightcore',
      value: 'nightcore',
      description: 'Higher pitch and tempo',
      emoji: '⭐',
    },
    {
      label: 'Vaporwave',
      value: 'vaporwave',
      description: 'Lower pitch and tempo',
      emoji: '🌊',
    },
    {
      label: '8D Audio',
      value: '8d',
      description: 'Spatial audio effect',
      emoji: '🎧',
    },
  ];
}

/**
 * Create audio filter select menu
 */
export function createFilterMenu(
  guildId: string,
  currentFilters?: AudioFilter[]
): ActionRowBuilder<StringSelectMenuBuilder> {
  const customId = createSelectMenuId('audio_filter', { guildId });
  const options = getFilterOptions();

  // Mark currently active filters as default
  if (currentFilters && currentFilters.length > 0) {
    options.forEach((option) => {
      option.default = currentFilters.includes(option.value as AudioFilter);
    });
  }

  const selectMenu = createStringSelectMenu(customId, 'Choose audio filters', options, {
    minValues: 0,
    maxValues: 3, // Allow up to 3 filters at once
  });

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

/**
 * Get filter description by value
 */
export function getFilterDescription(filter: AudioFilter): string {
  const filterMap: Record<AudioFilter, string> = {
    none: 'No audio filter applied',
    bassboost: 'Bass frequencies enhanced for deeper sound',
    nightcore: 'Higher pitch and faster tempo for energetic feel',
    vaporwave: 'Lower pitch and slower tempo for relaxed atmosphere',
    '8d': 'Spatial audio effect for immersive listening',
  };

  return filterMap[filter] || 'Unknown filter';
}

/**
 * Validate filter selection
 */
export function validateFilterSelection(filters: string[]): {
  valid: boolean;
  error?: string;
  filters?: AudioFilter[];
} {
  const validFilters: AudioFilter[] = ['none', 'bassboost', 'nightcore', 'vaporwave', '8d'];

  // Check if all selected filters are valid
  const invalidFilters = filters.filter((f) => !validFilters.includes(f as AudioFilter));
  if (invalidFilters.length > 0) {
    return {
      valid: false,
      error: `Invalid filters: ${invalidFilters.join(', ')}`,
    };
  }

  // If 'none' is selected with other filters, it's invalid
  if (filters.includes('none') && filters.length > 1) {
    return {
      valid: false,
      error: 'Cannot select "None" with other filters',
    };
  }

  return {
    valid: true,
    filters: filters as AudioFilter[],
  };
}
