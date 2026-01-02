/**
 * Select menu builder utilities
 */

import {
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ActionRowBuilder,
} from 'discord.js';
import type { SelectMenuMetadata, SelectMenuOption } from '../../types/select-menus';

/**
 * Create a custom ID for select menus with metadata
 */
export function createSelectMenuId(prefix: string, metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return prefix;
  }

  const parts = [prefix];
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}:${value}`);
    }
  }

  return parts.join('_');
}

/**
 * Parse a select menu custom ID to extract prefix and metadata
 */
export function parseSelectMenuId(customId: string): {
  prefix: string;
  metadata: SelectMenuMetadata;
} {
  const parts = customId.split('_');
  const prefix = parts[0] || '';
  const metadata: SelectMenuMetadata = { action: prefix };

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const colonIndex = part.indexOf(':');

    if (colonIndex > 0) {
      const key = part.substring(0, colonIndex);
      const value = part.substring(colonIndex + 1);

      // Try to parse as number if possible
      const numValue = Number(value);
      metadata[key] = isNaN(numValue) ? value : numValue;
    }
  }

  return { prefix, metadata };
}

/**
 * Create a string select menu with options
 */
export function createStringSelectMenu(
  customId: string,
  placeholder: string,
  options: SelectMenuOption[],
  config?: {
    minValues?: number;
    maxValues?: number;
    disabled?: boolean;
  }
): StringSelectMenuBuilder {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder);

  // Add options
  selectMenu.addOptions(
    options.map((option) => ({
      label: option.label,
      value: option.value,
      description: option.description,
      emoji: option.emoji,
      default: option.default || false,
    }))
  );

  // Configure min/max values
  if (config?.minValues !== undefined) {
    selectMenu.setMinValues(config.minValues);
  }
  if (config?.maxValues !== undefined) {
    selectMenu.setMaxValues(config.maxValues);
  }
  if (config?.disabled) {
    selectMenu.setDisabled(true);
  }

  return selectMenu;
}

/**
 * Create a user select menu
 */
export function createUserSelectMenu(
  customId: string,
  placeholder: string,
  config?: {
    minValues?: number;
    maxValues?: number;
    disabled?: boolean;
  }
): UserSelectMenuBuilder {
  const selectMenu = new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

  if (config?.minValues !== undefined) {
    selectMenu.setMinValues(config.minValues);
  }
  if (config?.maxValues !== undefined) {
    selectMenu.setMaxValues(config.maxValues);
  }
  if (config?.disabled) {
    selectMenu.setDisabled(true);
  }

  return selectMenu;
}

/**
 * Create a role select menu
 */
export function createRoleSelectMenu(
  customId: string,
  placeholder: string,
  config?: {
    minValues?: number;
    maxValues?: number;
    disabled?: boolean;
  }
): RoleSelectMenuBuilder {
  const selectMenu = new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);

  if (config?.minValues !== undefined) {
    selectMenu.setMinValues(config.minValues);
  }
  if (config?.maxValues !== undefined) {
    selectMenu.setMaxValues(config.maxValues);
  }
  if (config?.disabled) {
    selectMenu.setDisabled(true);
  }

  return selectMenu;
}

/**
 * Create a channel select menu
 */
export function createChannelSelectMenu(
  customId: string,
  placeholder: string,
  config?: {
    minValues?: number;
    maxValues?: number;
    disabled?: boolean;
  }
): ChannelSelectMenuBuilder {
  const selectMenu = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder);

  if (config?.minValues !== undefined) {
    selectMenu.setMinValues(config.minValues);
  }
  if (config?.maxValues !== undefined) {
    selectMenu.setMaxValues(config.maxValues);
  }
  if (config?.disabled) {
    selectMenu.setDisabled(true);
  }

  return selectMenu;
}

/**
 * Create a mentionable select menu
 */
export function createMentionableSelectMenu(
  customId: string,
  placeholder: string,
  config?: {
    minValues?: number;
    maxValues?: number;
    disabled?: boolean;
  }
): MentionableSelectMenuBuilder {
  const selectMenu = new MentionableSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder);

  if (config?.minValues !== undefined) {
    selectMenu.setMinValues(config.minValues);
  }
  if (config?.maxValues !== undefined) {
    selectMenu.setMaxValues(config.maxValues);
  }
  if (config?.disabled) {
    selectMenu.setDisabled(true);
  }

  return selectMenu;
}

/**
 * Create an action row with a select menu
 */
export function createSelectMenuRow<T>(selectMenu: T): ActionRowBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ActionRowBuilder().addComponents(selectMenu as any);
}

/**
 * Validate select menu configuration
 */
export function validateSelectMenuConfig(config: {
  minValues?: number;
  maxValues?: number;
  optionsCount?: number;
}): { valid: boolean; error?: string } {
  const { minValues = 1, maxValues = 1, optionsCount = 0 } = config;

  if (minValues < 0 || minValues > 25) {
    return { valid: false, error: 'minValues must be between 0 and 25' };
  }

  if (maxValues < 1 || maxValues > 25) {
    return { valid: false, error: 'maxValues must be between 1 and 25' };
  }

  if (minValues > maxValues) {
    return { valid: false, error: 'minValues cannot be greater than maxValues' };
  }

  if (optionsCount > 25) {
    return { valid: false, error: 'Cannot have more than 25 options in a select menu' };
  }

  if (maxValues > optionsCount && optionsCount > 0) {
    return { valid: false, error: 'maxValues cannot exceed number of available options' };
  }

  return { valid: true };
}
