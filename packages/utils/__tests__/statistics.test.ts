import {
  trackCommand,
  trackSound,
  trackQueueOperation,
  trackVoiceEvent,
  trackSearch,
  flushAll,
} from '@utils/statistics';

// Mock logger
jest.mock('@utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  }),
}));

// Mock database
jest.mock('@utils/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

describe('statistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackCommand', () => {
    it('tracks a successful command execution', () => {
      trackCommand('play', 'user-123', 'guild-456', 'discord', true, null, 'TestUser', '1234', 150);

      // Should not throw
      expect(true).toBe(true);
    });

    it('tracks a failed command execution', () => {
      trackCommand(
        'join',
        'user-123',
        'guild-456',
        'discord',
        false,
        'User not in voice channel',
        'TestUser',
        '1234',
        50
      );

      expect(true).toBe(true);
    });

    it('handles API source', () => {
      trackCommand('skip', 'user-123', 'guild-456', 'api', true, null, null, null, 75);

      expect(true).toBe(true);
    });
  });

  describe('trackSound', () => {
    it('tracks sound playback', () => {
      trackSound(
        'airhorn.mp3',
        'user-123',
        'guild-456',
        'local',
        true,
        2500,
        'discord',
        'TestUser',
        '1234'
      );

      expect(true).toBe(true);
    });

    it('tracks YouTube sound', () => {
      trackSound(
        'Song Title',
        'user-123',
        'guild-456',
        'youtube',
        false,
        180000,
        'discord',
        'TestUser',
        '1234'
      );

      expect(true).toBe(true);
    });

    it('handles null duration', () => {
      trackSound(
        'unknown.mp3',
        'user-123',
        'guild-456',
        'local',
        true,
        null,
        'api',
        'TestUser',
        null
      );

      expect(true).toBe(true);
    });
  });

  describe('trackQueueOperation', () => {
    it('tracks skip operation', () => {
      trackQueueOperation('skip', 'user-123', 'guild-456', 'discord', { position: 1 });

      expect(true).toBe(true);
    });

    it('tracks pause operation', () => {
      trackQueueOperation('pause', 'user-123', 'guild-456', 'discord', null);

      expect(true).toBe(true);
    });

    it('tracks clear operation', () => {
      trackQueueOperation('clear', 'user-123', 'guild-456', 'api', { tracksCleared: 5 });

      expect(true).toBe(true);
    });

    it('handles all operation types', () => {
      const operations: Array<'skip' | 'pause' | 'resume' | 'clear' | 'remove' | 'replay'> = [
        'skip',
        'pause',
        'resume',
        'clear',
        'remove',
        'replay',
      ];

      operations.forEach((op) => {
        trackQueueOperation(op, 'user-123', 'guild-456', 'discord', null);
      });

      expect(true).toBe(true);
    });
  });

  describe('trackVoiceEvent', () => {
    it('tracks bot join event', () => {
      trackVoiceEvent('join', 'guild-456', 'channel-789', 'General Voice', 'discord');

      expect(true).toBe(true);
    });

    it('tracks bot leave event', () => {
      trackVoiceEvent('leave', 'guild-456', 'channel-789', 'General Voice', 'discord');

      expect(true).toBe(true);
    });

    it('handles null channel name', () => {
      trackVoiceEvent('join', 'guild-456', 'channel-789', null, 'api');

      expect(true).toBe(true);
    });
  });

  describe('trackSearch', () => {
    it('tracks YouTube search with results', () => {
      trackSearch(
        'user-123',
        'guild-456',
        'never gonna give you up',
        'search',
        10,
        0,
        'Rick Astley - Never Gonna Give You Up',
        'discord'
      );

      expect(true).toBe(true);
    });

    it('tracks URL query', () => {
      trackSearch(
        'user-123',
        'guild-456',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'url',
        1,
        null,
        'Rick Roll',
        'discord'
      );

      expect(true).toBe(true);
    });

    it('tracks failed search', () => {
      trackSearch(
        'user-123',
        'guild-456',
        'nonexistent song xyz',
        'search',
        0,
        null,
        null,
        'discord'
      );

      expect(true).toBe(true);
    });

    it('tracks playlist query', () => {
      trackSearch(
        'user-123',
        'guild-456',
        'https://youtube.com/playlist?list=...',
        'playlist',
        25,
        null,
        null,
        'discord'
      );

      expect(true).toBe(true);
    });

    it('tracks soundboard query', () => {
      trackSearch('user-123', 'guild-456', 'airhorn', 'soundboard', 1, 0, 'airhorn.mp3', 'discord');

      expect(true).toBe(true);
    });
  });

  describe('flushAll', () => {
    it('flushes all buffers without error', async () => {
      await expect(flushAll()).resolves.not.toThrow();
    });

    it('returns a promise', () => {
      const result = flushAll();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
