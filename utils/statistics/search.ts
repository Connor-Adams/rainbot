import { BATCH_SIZE, log } from './config';
import { flushBatches, startBatchProcessor } from './batch';
import { searchBuffer } from './store';
import type { QueryType, Source } from './types';

/**
 * Track a search query
 */
export function trackSearch(
  userId: string,
  guildId: string,
  queryText: string,
  queryType: QueryType,
  resultsCount: number | null = null,
  selectedIndex: number | null = null,
  selectedTitle: string | null = null,
  source: string = 'discord'
): void {
  if (!userId || !guildId || !queryText) {
    log.debug('Invalid search tracking data, skipping');
    return;
  }

  try {
    searchBuffer.push({
      user_id: userId,
      guild_id: guildId,
      query: queryText,
      query_type: queryType,
      results_count: resultsCount,
      selected_index: selectedIndex,
      selected_title: selectedTitle,
      searched_at: new Date(),
      source: (source === 'api' ? 'api' : 'discord') as Source,
    });

    if (searchBuffer.length >= BATCH_SIZE) {
      flushBatches().catch((err: Error) => log.error(`Error flushing batches: ${err.message}`));
    }

    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Error tracking search: ${err.message}`);
  }
}
