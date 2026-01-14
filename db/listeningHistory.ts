import { createListeningHistoryRepo } from '@rainbot/db/listeningHistory';
import { createLogger } from '../utils/logger';
import { query } from '../utils/database';
import { detectSourceType } from '../utils/sourceType';

const log = createLogger('HISTORY');

const listeningHistoryRepo = createListeningHistoryRepo({
  query,
  logger: log,
  detectSourceType,
});

export const {
  saveHistory,
  getHistory,
  clearHistory,
  trackPlayed,
  getListeningHistory,
  getRecentHistory,
  clearListeningHistory,
} = listeningHistoryRepo;

export type { HistoryEntry, ListeningHistoryRow, Track, SourceType } from '@rainbot/db/listeningHistory';
