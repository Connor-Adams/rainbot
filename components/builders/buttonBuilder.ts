/**
 * Button builder utilities for creating Discord button components
 */

import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { ButtonMetadata } from '../../types/buttons.ts';

/**
 * Create a custom ID with embedded metadata
 * Format: prefix_key1:value1_key2:value2
 */
export function createButtonId(prefix: string, metadata: ButtonMetadata): string {
  const parts = [prefix];

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}:${value}`);
    }
  }

  return parts.join('_');
}

/**
 * Parse custom ID to extract metadata
 */
export function parseButtonId(customId: string): { prefix: string; metadata: ButtonMetadata } {
  const parts = customId.split('_');
  const prefix = parts[0] || '';
  const metadata: ButtonMetadata = { action: prefix };

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const [key, value] = part.split(':');
    if (key && value) {
      // Parse specific numeric fields, otherwise keep as string
      if (key === 'page' || key === 'totalPages') {
        const numValue = Number(value);
        (metadata as any)[key] = isNaN(numValue) ? value : numValue;
      } else {
        (metadata as any)[key] = value;
      }
    }
  }

  return { prefix, metadata };
}

/**
 * Create a button with common styling
 */
export function createButton(
  customId: string,
  label: string,
  style: ButtonStyle = 2, // Secondary
  emoji?: string,
  disabled: boolean = false
): ButtonBuilder {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

  if (emoji) {
    button.setEmoji(emoji);
  }

  return button;
}

/**
 * Create a primary action button (blurple)
 */
export function createPrimaryButton(
  customId: string,
  label: string,
  emoji?: string,
  disabled: boolean = false
): ButtonBuilder {
  return createButton(customId, label, ButtonStyle.Primary, emoji, disabled);
}

/**
 * Create a secondary action button (gray)
 */
export function createSecondaryButton(
  customId: string,
  label: string,
  emoji?: string,
  disabled: boolean = false
): ButtonBuilder {
  return createButton(customId, label, ButtonStyle.Secondary, emoji, disabled);
}

/**
 * Create a success action button (green)
 */
export function createSuccessButton(
  customId: string,
  label: string,
  emoji?: string,
  disabled: boolean = false
): ButtonBuilder {
  return createButton(customId, label, ButtonStyle.Success, emoji, disabled);
}

/**
 * Create a danger action button (red)
 */
export function createDangerButton(
  customId: string,
  label: string,
  emoji?: string,
  disabled: boolean = false
): ButtonBuilder {
  return createButton(customId, label, ButtonStyle.Danger, emoji, disabled);
}

/**
 * Create a link button
 */
export function createLinkButton(url: string, label: string, emoji?: string): ButtonBuilder {
  const button = new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link);

  if (emoji) {
    button.setEmoji(emoji);
  }

  return button;
}
