import { BATCH_SIZE, log } from './config';
import { flushBatches, startBatchProcessor } from './batch';
import { commandBuffer } from './store';
import type { ErrorType, Source } from './types';

/**
 * Classify error type from error message
 */
function classifyError(errorMessage: string | null): ErrorType {
  if (!errorMessage) return null;
  const msg = errorMessage.toLowerCase();

  if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('not allowed')) {
    return 'permission';
  }
  if (msg.includes('not found') || msg.includes('404') || msg.includes('does not exist')) {
    return 'not_found';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) {
    return 'rate_limit';
  }
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('abort')
  ) {
    return 'timeout';
  }
  if (
    msg.includes('invalid') ||
    msg.includes('missing') ||
    msg.includes('required') ||
    msg.includes('validation')
  ) {
    return 'validation';
  }
  if (
    msg.includes('youtube') ||
    msg.includes('spotify') ||
    msg.includes('soundcloud') ||
    msg.includes('api error') ||
    msg.includes('external')
  ) {
    return 'external_api';
  }
  return 'internal';
}

/**
 * Track a command execution
 */
export function trackCommand(
  commandName: string,
  userId: string,
  guildId: string,
  source: string = 'discord',
  success: boolean = true,
  errorMessage: string | null = null,
  username: string | null = null,
  discriminator: string | null = null,
  executionTimeMs: number | null = null
): void {
  if (!commandName || !userId || !guildId) {
    log.debug('Invalid command tracking data, skipping');
    return;
  }

  try {
    commandBuffer.push({
      command_name: commandName,
      user_id: userId,
      guild_id: guildId,
      username,
      discriminator,
      source: (source === 'api' ? 'api' : 'discord') as Source,
      executed_at: new Date(),
      success,
      error_message: errorMessage,
      execution_time_ms: executionTimeMs,
      error_type: success ? null : classifyError(errorMessage),
    });

    if (commandBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err: Error) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking command: ${err.message}`);
  }
}
