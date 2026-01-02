/**
 * Register all button handlers
 */

import { registerButtonHandler } from './buttonHandler';
import {
  handlePauseButton,
  handleSkipButton,
  handleStopButton,
  handleQueueButton,
} from './musicButtonHandlers';
import { createLogger } from '../utils/logger';

const log = createLogger('BUTTON_REGISTRY');

/**
 * Initialize and register all button handlers
 */
export function initializeButtonHandlers(): void {
  log.info('Registering button handlers...');

  // Register music control handlers
  registerButtonHandler('player_pause', handlePauseButton);
  registerButtonHandler('player_skip', handleSkipButton);
  registerButtonHandler('player_stop', handleStopButton);
  registerButtonHandler('player_queue', handleQueueButton);

  // TODO: Register pagination handlers
  // registerButtonHandler('queue_prev', handlePrevPageButton);
  // registerButtonHandler('queue_next', handleNextPageButton);
  // registerButtonHandler('queue_first', handleFirstPageButton);
  // registerButtonHandler('queue_last', handleLastPageButton);

  // TODO: Register confirmation handlers
  // registerButtonHandler('confirm', handleConfirmButton);
  // registerButtonHandler('cancel', handleCancelButton);

  log.info('Button handlers registered successfully');
}
