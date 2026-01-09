/**
 * Repeat mode select menu component
 */

import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import type { RepeatMode, SelectMenuOption } from '../../../types/select-menus';
import { createStringSelectMenu, createSelectMenuId } from '../../builders/selectMenuBuilder';

/**
 * Get repeat mode options for the select menu
 */
export function getRepeatModeOptions(): SelectMenuOption[] {
  return [
    {
      label: 'Off',
      value: 'off',
      description: 'No repeat - play queue once',
      emoji: '➡️',
    },
    {
      label: 'Track',
      value: 'track',
      description: 'Repeat current track',
      emoji: '🔂',
    },
    {
      label: 'Queue',
      value: 'queue',
      description: 'Repeat entire queue',
      emoji: '🔁',
    },
  ];
}

/**
 * Create repeat mode select menu
 */
export function createRepeatModeMenu(
  guildId: string,
  currentMode?: RepeatMode
): ActionRowBuilder<StringSelectMenuBuilder> {
  const customId = createSelectMenuId('repeat_mode', { guildId });
  const options = getRepeatModeOptions();

  // Mark current repeat mode as default
  if (currentMode) {
    options.forEach((option) => {
      option.default = option.value === currentMode;
    });
  }

  const selectMenu = createStringSelectMenu(customId, 'Select repeat mode', options, {
    minValues: 1,
    maxValues: 1,
  });

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

/**
 * Get repeat mode description
 */
export function getRepeatModeDescription(mode: RepeatMode): string {
  const modeMap: Record<RepeatMode, string> = {
    off: 'Queue plays once without repeating',
    track: 'Current track repeats continuously',
    queue: 'Queue repeats after the last track',
  };

  return modeMap[mode] || 'Unknown repeat mode';
}

/**
 * Get repeat mode emoji
 */
export function getRepeatModeEmoji(mode: RepeatMode): string {
  const emojiMap: Record<RepeatMode, string> = {
    off: '➡️',
    track: '🔂',
    queue: '🔁',
  };

  return emojiMap[mode] || '❓';
}

/**
 * Validate repeat mode selection
 */
export function validateRepeatMode(mode: string): {
  valid: boolean;
  error?: string;
  mode?: RepeatMode;
} {
  const validModes: RepeatMode[] = ['off', 'track', 'queue'];

  if (!validModes.includes(mode as RepeatMode)) {
    return {
      valid: false,
      error: `Invalid repeat mode: ${mode}`,
    };
  }

  return {
    valid: true,
    mode: mode as RepeatMode,
  };
}
