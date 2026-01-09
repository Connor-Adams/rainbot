/**
 * Select menu handler registry
 * Registers all select menu handlers at startup
 */

import { registerSelectMenuHandler } from './selectMenuHandler';
import { audioFilterHandler } from './filterMenuHandler';
import { repeatModeHandler } from './repeatModeHandler';
import { createLogger } from '../utils/logger';

const log = createLogger('SELECT_MENU_REGISTRY');

/**
 * Initialize all select menu handlers
 */
export function initializeSelectMenuHandlers(): void {
  log.info('Initializing select menu handlers...');

  // Register audio filter handler
  registerSelectMenuHandler('audio_filter', audioFilterHandler);

  // Register repeat mode handler
  registerSelectMenuHandler('repeat_mode', repeatModeHandler);

  log.info('Select menu handlers initialized successfully');
}
