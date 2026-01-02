/**
 * Confirmation dialog buttons
 */

import { ActionRowBuilder, ButtonBuilder } from 'discord.js';
import {
  createSuccessButton,
  createDangerButton,
  createSecondaryButton,
  createButtonId,
} from '../../builders/buttonBuilder';

/**
 * Confirmation action types
 */
export type ConfirmAction = 'clear_queue' | 'stop_playback' | 'leave_channel' | 'delete' | 'generic';

/**
 * Create confirm button
 */
export function createConfirmButton(
  action: ConfirmAction,
  guildId?: string,
  userId?: string
): ButtonBuilder {
  const metadata: Record<string, string | number> = { action };
  if (guildId) metadata.guildId = guildId;
  if (userId) metadata.userId = userId;

  const customId = createButtonId('confirm', metadata);
  return createSuccessButton(customId, 'Confirm', '✅');
}

/**
 * Create cancel button
 */
export function createCancelButton(
  action: ConfirmAction,
  guildId?: string,
  userId?: string
): ButtonBuilder {
  const metadata: Record<string, string | number> = { action };
  if (guildId) metadata.guildId = guildId;
  if (userId) metadata.userId = userId;

  const customId = createButtonId('cancel', metadata);
  return createDangerButton(customId, 'Cancel', '❌');
}

/**
 * Create a confirmation row with confirm and cancel buttons
 */
export function createConfirmationRow(
  action: ConfirmAction,
  guildId?: string,
  userId?: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createConfirmButton(action, guildId, userId),
    createCancelButton(action, guildId, userId)
  );
}

/**
 * Create yes/no buttons (alternative to confirm/cancel)
 */
export function createYesNoRow(
  action: ConfirmAction,
  guildId?: string,
  userId?: string
): ActionRowBuilder<ButtonBuilder> {
  const yesMetadata: Record<string, string | number> = { action, response: 'yes' };
  const noMetadata: Record<string, string | number> = { action, response: 'no' };

  if (guildId) {
    yesMetadata.guildId = guildId;
    noMetadata.guildId = guildId;
  }
  if (userId) {
    yesMetadata.userId = userId;
    noMetadata.userId = userId;
  }

  const yesId = createButtonId('yes', yesMetadata);
  const noId = createButtonId('no', noMetadata);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createSuccessButton(yesId, 'Yes', '✅'),
    createSecondaryButton(noId, 'No', '❌')
  );
}

/**
 * Create destructive action confirmation (for dangerous operations)
 */
export function createDestructiveConfirmationRow(
  action: ConfirmAction,
  guildId?: string,
  userId?: string
): ActionRowBuilder<ButtonBuilder> {
  const confirmMetadata: Record<string, string | number> = { action };
  const cancelMetadata: Record<string, string | number> = { action };

  if (guildId) {
    confirmMetadata.guildId = guildId;
    cancelMetadata.guildId = guildId;
  }
  if (userId) {
    confirmMetadata.userId = userId;
    cancelMetadata.userId = userId;
  }

  const confirmId = createButtonId('confirm_destructive', confirmMetadata);
  const cancelId = createButtonId('cancel', cancelMetadata);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createDangerButton(confirmId, 'Yes, Proceed', '⚠️'),
    createSecondaryButton(cancelId, 'Cancel', '❌')
  );
}

/**
 * Get confirmation message for action type
 */
export function getConfirmationMessage(action: ConfirmAction): string {
  switch (action) {
    case 'clear_queue':
      return '⚠️ Are you sure you want to clear the entire queue? This action cannot be undone.';
    case 'stop_playback':
      return '⚠️ Are you sure you want to stop playback and clear the queue?';
    case 'leave_channel':
      return '⚠️ Are you sure you want to disconnect the bot from the voice channel?';
    case 'delete':
      return '⚠️ Are you sure you want to delete this? This action cannot be undone.';
    case 'generic':
    default:
      return '⚠️ Are you sure you want to proceed?';
  }
}
