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
import { handleQueuePaginationButton } from './paginationButtonHandlers';
import { handleConfirmButton, handleCancelButton } from './confirmButtonHandlers';
import { createLogger } from '@utils/logger';

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

  // Register pagination handlers
  registerButtonHandler('queue_prev', handleQueuePaginationButton);
  registerButtonHandler('queue_next', handleQueuePaginationButton);
  registerButtonHandler('queue_first', handleQueuePaginationButton);
  registerButtonHandler('queue_last', handleQueuePaginationButton);

  // Register confirmation handlers
  registerButtonHandler('confirm', handleConfirmButton);
  registerButtonHandler('confirm_destructive', handleConfirmButton);
  registerButtonHandler('cancel', handleCancelButton);

  log.info('Button handlers registered successfully');
}
