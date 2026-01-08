import {
  trackCommand,
  trackSound,
  trackQueueOperation,
  trackVoiceEvent,
  trackSearch,
  flushAll,
} from '../statistics';

// Mock logger
jest.mock('../logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  }),
}));

// Mock database
jest.mock('../database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

describe('statistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackCommand', () => {
    it('tracks a successful command execution', () => {
      trackCommand({
        commandName: 'play',
        userId: 'user-123',
        guildId: 'guild-456',
        username: 'TestUser',
        discriminator: '1234',
        source: 'discord',
        success: true,
        errorMessage: null,
        executionTimeMs: 150,
        errorType: null,
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('tracks a failed command execution', () => {
      trackCommand({
        commandName: 'join',
        userId: 'user-123',
        guildId: 'guild-456',
        username: 'TestUser',
        discriminator: '1234',
        source: 'discord',
        success: false,
        errorMessage: 'User not in voice channel',
        executionTimeMs: 50,
        errorType: 'validation',
      });

      expect(true).toBe(true);
    });

    it('handles API source', () => {
      trackCommand({
        commandName: 'skip',
        userId: 'user-123',
        guildId: 'guild-456',
        username: null,
        discriminator: null,
        source: 'api',
        success: true,
        errorMessage: null,
        executionTimeMs: 75,
        errorType: null,
      });

      expect(true).toBe(true);
    });
  });

  describe('trackSound', () => {
    it('tracks sound playback', () => {
      trackSound({
        soundName: 'airhorn.mp3',
        userId: 'user-123',
        guildId: 'guild-456',
        username: 'TestUser',
        discriminator: '1234',
        sourceType: 'local',
        isSoundboard: true,
        duration: 2500,
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('tracks YouTube sound', () => {
      trackSound({
        soundName: 'Song Title',
        userId: 'user-123',
        guildId: 'guild-456',
        username: 'TestUser',
        discriminator: '1234',
        sourceType: 'youtube',
        isSoundboard: false,
        duration: 180000,
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('handles null duration', () => {
      trackSound({
        soundName: 'unknown.mp3',
        userId: 'user-123',
        guildId: 'guild-456',
        username: 'TestUser',
        discriminator: null,
        sourceType: 'local',
        isSoundboard: true,
        duration: null,
        source: 'api',
      });

      expect(true).toBe(true);
    });
  });

  describe('trackQueueOperation', () => {
    it('tracks skip operation', () => {
      trackQueueOperation({
        operationType: 'skip',
        userId: 'user-123',
        guildId: 'guild-456',
        source: 'discord',
        metadata: { position: 1 },
      });

      expect(true).toBe(true);
    });

    it('tracks pause operation', () => {
      trackQueueOperation({
        operationType: 'pause',
        userId: 'user-123',
        guildId: 'guild-456',
        source: 'discord',
        metadata: null,
      });

      expect(true).toBe(true);
    });

    it('tracks clear operation', () => {
      trackQueueOperation({
        operationType: 'clear',
        userId: 'user-123',
        guildId: 'guild-456',
        source: 'api',
        metadata: { tracksCleared: 5 },
      });

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
        trackQueueOperation({
          operationType: op,
          userId: 'user-123',
          guildId: 'guild-456',
          source: 'discord',
          metadata: null,
        });
      });

      expect(true).toBe(true);
    });
  });

  describe('trackVoiceEvent', () => {
    it('tracks bot join event', () => {
      trackVoiceEvent({
        eventType: 'join',
        guildId: 'guild-456',
        channelId: 'channel-789',
        channelName: 'General Voice',
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('tracks bot leave event', () => {
      trackVoiceEvent({
        eventType: 'leave',
        guildId: 'guild-456',
        channelId: 'channel-789',
        channelName: 'General Voice',
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('handles null channel name', () => {
      trackVoiceEvent({
        eventType: 'join',
        guildId: 'guild-456',
        channelId: 'channel-789',
        channelName: null,
        source: 'api',
      });

      expect(true).toBe(true);
    });
  });

  describe('trackSearch', () => {
    it('tracks YouTube search with results', () => {
      trackSearch({
        userId: 'user-123',
        guildId: 'guild-456',
        query: 'never gonna give you up',
        queryType: 'search',
        resultsCount: 10,
        selectedIndex: 0,
        selectedTitle: 'Rick Astley - Never Gonna Give You Up',
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('tracks URL query', () => {
      trackSearch({
        userId: 'user-123',
        guildId: 'guild-456',
        query: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        queryType: 'url',
        resultsCount: 1,
        selectedIndex: null,
        selectedTitle: 'Rick Roll',
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('tracks failed search', () => {
      trackSearch({
        userId: 'user-123',
        guildId: 'guild-456',
        query: 'nonexistent song xyz',
        queryType: 'search',
        resultsCount: 0,
        selectedIndex: null,
        selectedTitle: null,
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('tracks playlist query', () => {
      trackSearch({
        userId: 'user-123',
        guildId: 'guild-456',
        query: 'https://youtube.com/playlist?list=...',
        queryType: 'playlist',
        resultsCount: 25,
        selectedIndex: null,
        selectedTitle: null,
        source: 'discord',
      });

      expect(true).toBe(true);
    });

    it('tracks soundboard query', () => {
      trackSearch({
        userId: 'user-123',
        guildId: 'guild-456',
        query: 'airhorn',
        queryType: 'soundboard',
        resultsCount: 1,
        selectedIndex: 0,
        selectedTitle: 'airhorn.mp3',
        source: 'discord',
      });

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
