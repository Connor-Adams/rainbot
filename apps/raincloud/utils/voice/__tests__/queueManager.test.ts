import { withQueueLock, addToQueue, clearQueue } from '../queueManager';
import type { Track } from '@rainbot/protocol';

// Mock logger
jest.mock('../../logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  }),
}));

// Mock statistics
jest.mock('../../statistics', () => ({
  trackQueueOperation: jest.fn(),
}));

// Mock connection manager
const mockVoiceState = {
  queue: [] as Track[],
  currentTrack: null,
  connection: null,
  player: {
    state: {
      status: 'idle',
    },
  },
  volume: 1.0,
  overlayProcess: null,
  channelName: 'Test Channel',
};

jest.mock('../connectionManager', () => ({
  getVoiceState: jest.fn(() => mockVoiceState),
}));

// Mock snapshot persistence
jest.mock('../snapshotPersistence', () => ({
  saveQueueSnapshot: jest.fn(),
}));

describe('queueManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoiceState.queue = [];
    mockVoiceState.currentTrack = null;
  });

  describe('withQueueLock', () => {
    it('executes function with mutex lock', async () => {
      const testFn = jest.fn(() => 'result');

      const result = await withQueueLock('guild-1', testFn);

      expect(result).toBe('result');
      expect(testFn).toHaveBeenCalledTimes(1);
    });

    it('releases lock even if function throws', async () => {
      const errorFn = jest.fn(() => {
        throw new Error('Test error');
      });

      await expect(withQueueLock('guild-1', errorFn)).rejects.toThrow('Test error');

      // Lock should be released, so we can acquire it again
      const successFn = jest.fn(() => 'success');
      const result = await withQueueLock('guild-1', successFn);
      expect(result).toBe('success');
    });
  });

  describe('addToQueue', () => {
    it('adds tracks to empty queue', async () => {
      const tracks: Track[] = [
        { title: 'Track 1', url: 'https://example.com/1', isLocal: false },
        { title: 'Track 2', url: 'https://example.com/2', isLocal: false },
      ];

      const result = await addToQueue('guild-1', tracks);

      expect(result.added).toBe(2);
      expect(result.tracks).toEqual(tracks);
      expect(mockVoiceState.queue).toHaveLength(2);
    });

    it('appends tracks to existing queue', async () => {
      mockVoiceState.queue = [{ title: 'Existing', url: 'https://example.com/0', isLocal: false }];

      const newTracks: Track[] = [
        { title: 'New Track', url: 'https://example.com/1', isLocal: false },
      ];

      const result = await addToQueue('guild-1', newTracks);

      expect(result.added).toBe(1);
      expect(mockVoiceState.queue).toHaveLength(2);
      expect(mockVoiceState.queue[1].title).toBe('New Track');
    });

    it('throws error when bot not in voice channel', async () => {
      const { getVoiceState } = require('../connectionManager');
      getVoiceState.mockReturnValueOnce(null);

      const tracks: Track[] = [{ title: 'Track', url: 'https://example.com/1', isLocal: false }];

      await expect(addToQueue('guild-1', tracks)).rejects.toThrow(
        'Bot is not connected to a voice channel'
      );
    });

    it('handles empty track array', async () => {
      const result = await addToQueue('guild-1', []);

      expect(result.added).toBe(0);
      expect(result.tracks).toEqual([]);
      expect(mockVoiceState.queue).toHaveLength(0);
    });
  });

  describe('clearQueue', () => {
    it('clears all tracks from queue', async () => {
      mockVoiceState.queue = [
        { title: 'Track 1', url: 'https://example.com/1', isLocal: false },
        { title: 'Track 2', url: 'https://example.com/2', isLocal: false },
      ];

      await clearQueue('guild-1');

      expect(mockVoiceState.queue).toHaveLength(0);
    });

    it('throws when bot not connected', async () => {
      const { getVoiceState } = require('../connectionManager');
      getVoiceState.mockReturnValueOnce(null);

      await expect(clearQueue('guild-1')).rejects.toThrow(
        'Bot is not connected to a voice channel'
      );
    });

    it('handles already empty queue', async () => {
      mockVoiceState.queue = [];

      await clearQueue('guild-1');

      expect(mockVoiceState.queue).toHaveLength(0);
    });
  });
});
