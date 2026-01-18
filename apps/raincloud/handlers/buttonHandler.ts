/**
 * Centralized button handler system
 */

import type { ButtonInteraction } from 'discord.js';
import type { ButtonHandler, ButtonHandlerResult } from '@rainbot/protocol';
import { createLogger } from '@rainbot/utils';
import { parseButtonId } from '@rainbot/utils';

const log = createLogger('BUTTON_HANDLER');

/**
 * Registry of button handlers
 */
const buttonHandlers = new Map<string, ButtonHandler>();

/**
 * Register a button handler for a specific prefix
 */
export function registerButtonHandler(prefix: string, handler: ButtonHandler): void {
  if (buttonHandlers.has(prefix)) {
    log.warn(`Overwriting existing handler for prefix: ${prefix}`);
  }
  buttonHandlers.set(prefix, handler);
  log.debug(`Registered button handler: ${prefix}`);
}

/**
 * Unregister a button handler
 */
export function unregisterButtonHandler(prefix: string): boolean {
  const removed = buttonHandlers.delete(prefix);
  if (removed) {
    log.debug(`Unregistered button handler: ${prefix}`);
  }
  return removed;
}

/**
 * Get a button handler by prefix
 */
export function getButtonHandler(prefix: string): ButtonHandler | undefined {
  return buttonHandlers.get(prefix);
}

/**
 * Check if a handler is registered for a prefix
 */
export function hasButtonHandler(prefix: string): boolean {
  return buttonHandlers.has(prefix);
}

/**
 * Main button interaction handler
 */
export async function handleButtonInteraction(
  interaction: ButtonInteraction
): Promise<ButtonHandlerResult> {
  const startTime = Date.now();
  const { customId } = interaction;

  try {
    // Parse the custom ID to get prefix and metadata
    const { prefix, metadata } = parseButtonId(customId);

    log.debug(`Button clicked: ${prefix} by ${interaction.user.tag}`, { metadata });

    // Find the appropriate handler
    const handler = getButtonHandler(prefix);

    if (!handler) {
      log.warn(`No handler registered for button prefix: ${prefix}`);
      return {
        success: false,
        error: `No handler found for button: ${prefix}`,
      };
    }

    // Prepare context from metadata
    const context = {
      guildId: interaction.guildId || metadata.guildId?.toString() || '',
      userId: metadata.userId?.toString(),
      page: typeof metadata.page === 'number' ? metadata.page : undefined,
      metadata,
    };

    // Execute the handler
    const result = await handler(interaction, context);

    const duration = Date.now() - startTime;
    log.debug(`Button handled: ${prefix} in ${duration}ms`, {
      success: result.success,
      error: result.error,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`Error handling button interaction: ${error}`, {
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
export function clearAllHandlers(): void {
  buttonHandlers.clear();
  log.debug('Cleared all button handlers');
}

/**
 * Get all registered handler prefixes
 */
export function getRegisteredPrefixes(): string[] {
  return Array.from(buttonHandlers.keys());
}

/**
 * Get count of registered handlers
 */
export function getHandlerCount(): number {
  return buttonHandlers.size;
}
