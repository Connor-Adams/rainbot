/**
 * Centralized select menu handler system
 */

import type {
  AnySelectMenuInteraction,
  SelectMenuHandler,
  SelectMenuHandlerResult,
  SelectMenuContext,
} from '../types/select-menus';
import { createLogger } from '../utils/logger';
import { parseSelectMenuId } from '../components/builders/selectMenuBuilder';

const log = createLogger('SELECT_MENU_HANDLER');

/**
 * Registry of select menu handlers
 */
const selectMenuHandlers = new Map<string, SelectMenuHandler>();

/**
 * Register a select menu handler for a specific prefix
 */
export function registerSelectMenuHandler(prefix: string, handler: SelectMenuHandler): void {
  if (selectMenuHandlers.has(prefix)) {
    log.warn(`Overwriting existing handler for prefix: ${prefix}`);
  }
  selectMenuHandlers.set(prefix, handler);
  log.debug(`Registered select menu handler: ${prefix}`);
}

/**
 * Unregister a select menu handler
 */
export function unregisterSelectMenuHandler(prefix: string): boolean {
  const removed = selectMenuHandlers.delete(prefix);
  if (removed) {
    log.debug(`Unregistered select menu handler: ${prefix}`);
  }
  return removed;
}

/**
 * Get a select menu handler by prefix
 */
export function getSelectMenuHandler(prefix: string): SelectMenuHandler | undefined {
  return selectMenuHandlers.get(prefix);
}

/**
 * Check if a handler is registered for a prefix
 */
export function hasSelectMenuHandler(prefix: string): boolean {
  return selectMenuHandlers.has(prefix);
}

/**
 * Main select menu interaction handler
 */
export async function handleSelectMenuInteraction(
  interaction: AnySelectMenuInteraction
): Promise<SelectMenuHandlerResult> {
  const startTime = Date.now();
  const { customId } = interaction;

  try {
    // Parse the custom ID to get prefix and metadata
    const { prefix, metadata } = parseSelectMenuId(customId);

    log.debug(`Select menu used: ${prefix} by ${interaction.user.tag}`, { metadata });

    // Find the appropriate handler
    const handler = getSelectMenuHandler(prefix);

    if (!handler) {
      log.warn(`No handler registered for select menu prefix: ${prefix}`);
      return {
        success: false,
        error: `No handler found for select menu: ${prefix}`,
      };
    }

    // Prepare context from metadata
    const context: SelectMenuContext = {
      guildId: interaction.guildId || metadata.guildId?.toString() || '',
      userId: interaction.user.id,
      channelId: interaction.channelId || undefined,
      metadata,
    };

    // Execute the handler
    const result = await handler(interaction, context);

    const duration = Date.now() - startTime;
    log.debug(`Select menu handled: ${prefix} in ${duration}ms`, {
      success: result.success,
      error: result.error,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`Error handling select menu interaction: ${error}`, {
      customId,
      duration,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clear all registered handlers (useful for testing)
 */
export function clearAllSelectMenuHandlers(): void {
  selectMenuHandlers.clear();
  log.debug('Cleared all select menu handlers');
}

/**
 * Get all registered handler prefixes
 */
export function getRegisteredSelectMenuPrefixes(): string[] {
  return Array.from(selectMenuHandlers.keys());
}

/**
 * Get count of registered handlers
 */
export function getSelectMenuHandlerCount(): number {
  return selectMenuHandlers.size;
}
