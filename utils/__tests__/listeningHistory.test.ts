import { saveHistory, getHistory, clearHistory } from '@utils/listeningHistory';
import type { Track } from '@utils/listeningHistory';

describe('listeningHistory', () => {
  beforeEach(() => {
    // Clear any history before each test
    clearHistory('test-user-1');
    clearHistory('test-user-2');
  });

  describe('saveHistory', () => {
    it('saves history for a user', () => {
      const tracks: Track[] = [
        { title: 'Track 1', url: 'https://youtube.com/watch?v=123' },
        { title: 'Track 2', url: 'https://youtube.com/watch?v=456' },
      ];
      saveHistory('test-user-1', 'test-guild-1', tracks, 'Now Playing Track', tracks[0] ?? null);

      const history = getHistory('test-user-1');
      expect(history).not.toBeNull();
      expect(history?.guildId).toBe('test-guild-1');
      expect(history?.queue).toHaveLength(2);
      expect(history?.nowPlaying).toBe('Now Playing Track');
    });

    it('does not save if userId is missing', () => {
      saveHistory('', 'test-guild-1', [], null, null);
      expect(getHistory('')).toBeNull();
    });

    it('does not save if guildId is missing', () => {
      saveHistory('test-user-1', '', [], null, null);
      const history = getHistory('test-user-1');
      // History should not be saved without guildId
      expect(history).toBeNull();
    });

    it('does not save if no content (empty queue and no nowPlaying)', () => {
      saveHistory('test-user-1', 'test-guild-1', [], null, null);
      const history = getHistory('test-user-1');
      expect(history).toBeNull();
    });

    it('saves if there is nowPlaying even with empty queue', () => {
      saveHistory('test-user-1', 'test-guild-1', [], 'Now Playing Track', null);
      const history = getHistory('test-user-1');
      expect(history).not.toBeNull();
      expect(history?.nowPlaying).toBe('Now Playing Track');
    });

    it('limits queue to MAX_HISTORY_TRACKS (50)', () => {
      const largeTracks: Track[] = Array.from({ length: 100 }, (_, i) => ({
        title: `Track ${i}`,
        url: `https://youtube.com/watch?v=${i}`,
      }));
      saveHistory(
        'test-user-1',
        'test-guild-1',
        largeTracks,
        'Now Playing',
        largeTracks[0] ?? null
      );

      const history = getHistory('test-user-1');
      expect(history?.queue).toHaveLength(50);
    });

    it('overwrites existing history for the same user', () => {
      const tracks1: Track[] = [{ title: 'Track 1', url: 'https://youtube.com/watch?v=123' }];
      const tracks2: Track[] = [{ title: 'Track 2', url: 'https://youtube.com/watch?v=456' }];

      saveHistory('test-user-1', 'test-guild-1', tracks1, 'First', tracks1[0] ?? null);
      saveHistory('test-user-1', 'test-guild-1', tracks2, 'Second', tracks2[0] ?? null);

      const history = getHistory('test-user-1');
      expect(history?.nowPlaying).toBe('Second');
      expect(history?.queue[0]?.title).toBe('Track 2');
    });
  });

  describe('getHistory', () => {
    it('returns null if userId is missing', () => {
      expect(getHistory('')).toBeNull();
    });

    it('returns null if no history exists for user', () => {
      expect(getHistory('non-existent-user')).toBeNull();
    });

    it('returns saved history for user', () => {
      const tracks: Track[] = [{ title: 'Track 1', url: 'https://youtube.com/watch?v=123' }];
      saveHistory('test-user-1', 'test-guild-1', tracks, 'Now Playing', tracks[0] ?? null);

      const history = getHistory('test-user-1');
      expect(history).not.toBeNull();
      expect(history?.queue[0]?.title).toBe('Track 1');
    });

    it('includes timestamp in returned history', () => {
      const tracks: Track[] = [{ title: 'Track 1', url: 'https://youtube.com/watch?v=123' }];
      const beforeSave = Date.now();
      saveHistory('test-user-1', 'test-guild-1', tracks, 'Now Playing', tracks[0] ?? null);
      const afterSave = Date.now();

      const history = getHistory('test-user-1');
      expect(history?.timestamp).toBeGreaterThanOrEqual(beforeSave);
      expect(history?.timestamp).toBeLessThanOrEqual(afterSave);
    });

    it('deletes and returns null for expired history (> 24 hours)', () => {
      const tracks: Track[] = [{ title: 'Track 1', url: 'https://youtube.com/watch?v=123' }];
      saveHistory('test-user-1', 'test-guild-1', tracks, 'Now Playing', tracks[0] ?? null);

      // Manually modify the timestamp to simulate old data
      // We need to access the internal map for this test
      const history = getHistory('test-user-1');
      if (history) {
        history.timestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      }

      // Now getHistory should delete and return null
      const result = getHistory('test-user-1');
      expect(result).toBeNull();
    });
  });

  describe('clearHistory', () => {
    it('clears history for a user', () => {
      const tracks: Track[] = [{ title: 'Track 1', url: 'https://youtube.com/watch?v=123' }];
      saveHistory('test-user-1', 'test-guild-1', tracks, 'Now Playing', tracks[0] ?? null);

      expect(getHistory('test-user-1')).not.toBeNull();
      clearHistory('test-user-1');
      expect(getHistory('test-user-1')).toBeNull();
    });

    it('does not affect other users when clearing', () => {
      const tracks1: Track[] = [{ title: 'Track 1', url: 'https://youtube.com/watch?v=123' }];
      const tracks2: Track[] = [{ title: 'Track 2', url: 'https://youtube.com/watch?v=456' }];

      saveHistory('test-user-1', 'test-guild-1', tracks1, 'User 1', tracks1[0] ?? null);
      saveHistory('test-user-2', 'test-guild-1', tracks2, 'User 2', tracks2[0] ?? null);

      clearHistory('test-user-1');

      expect(getHistory('test-user-1')).toBeNull();
      expect(getHistory('test-user-2')).not.toBeNull();
    });

    it('is safe to call on non-existent user', () => {
      expect(() => clearHistory('non-existent-user')).not.toThrow();
    });
  });
});
