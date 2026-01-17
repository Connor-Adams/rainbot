import { saveHistory, getHistory, clearHistory } from '../listeningHistory';
import type { Track } from '../listeningHistory';

describe('listeningHistory', () => {
  describe('saveHistory', () => {
    it('does not persist in-memory history', () => {
      const tracks: Track[] = [
        { title: 'Track 1', url: 'https://youtube.com/watch?v=123' },
        { title: 'Track 2', url: 'https://youtube.com/watch?v=456' },
      ];

      saveHistory('test-user-1', 'test-guild-1', tracks, 'Now Playing Track', tracks[0]);

      expect(getHistory('test-user-1')).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('returns null without in-memory storage', () => {
      expect(getHistory('test-user-1')).toBeNull();
    });
  });

  describe('clearHistory', () => {
    it('is safe to call when in-memory history is disabled', () => {
      expect(() => clearHistory('test-user-1')).not.toThrow();
    });
  });
});
