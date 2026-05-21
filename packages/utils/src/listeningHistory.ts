import { createListeningHistoryRepo } from '@rainbot/db';
import { createLogger } from './logger';
import { query } from './database';
import { detectSourceType } from './sourceType';

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

export type { HistoryEntry, ListeningHistoryRow, Track, SourceType } from '@rainbot/db';
