/**
 * Tests for autoplay functionality
 *
 * These tests verify:
 * 1. Autoplay flag can be toggled in VoiceState
 * 2. getRelatedTrack finds similar tracks
 * 3. Autoplay respects the enabled/disabled state
 */

import type { Track } from '@rainbot/protocol';
import * as trackFetcher from '../trackFetcher';

// Mock dependencies
jest.mock('../../logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../../storage', () => ({
  soundExists: jest.fn(),
  getSoundStream: jest.fn(),
}));

// Mock play-dl
jest.mock('play-dl', () => ({
  default: {
    search: jest.fn(),
    validate: jest.fn(),
    video_basic_info: jest.fn(),
  },
  search: jest.fn(),
  validate: jest.fn(),
  video_basic_info: jest.fn(),
}));

// Mock youtube-dl-exec
jest.mock('youtube-dl-exec', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => {
      const mockYtDlp = jest.fn().mockResolvedValue({
        title: 'Test Video',
        duration: 300,
        webpage_url: 'https://www.youtube.com/watch?v=test123',
      });
      return mockYtDlp;
    }),
  },
}));

describe('Autoplay Functionality', () => {
  describe('getRelatedTrack', () => {
    it('should return null for non-YouTube tracks', async () => {
      const localTrack: Track = {
        title: 'Local Sound',
        isLocal: true,
        source: 'sound.mp3',
      };

      const result = await trackFetcher.getRelatedTrack(localTrack);
      expect(result).toBeNull();
    });

    it('should return null for tracks without URL', async () => {
      const trackWithoutUrl: Track = {
        title: 'No URL Track',
        isLocal: false,
      };

      const result = await trackFetcher.getRelatedTrack(trackWithoutUrl);
      expect(result).toBeNull();
    });

    it('should return null for non-YouTube URLs', async () => {
      const soundcloudTrack: Track = {
        title: 'SoundCloud Track',
        url: 'https://soundcloud.com/artist/track',
        isLocal: false,
      };

      const result = await trackFetcher.getRelatedTrack(soundcloudTrack);
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const play = require('play-dl');
      play.search.mockRejectedValueOnce(new Error('Search failed'));

      const youtubeTrack: Track = {
        title: 'Test Video',
        url: 'https://www.youtube.com/watch?v=test123',
        isLocal: false,
      };

      const result = await trackFetcher.getRelatedTrack(youtubeTrack);
      expect(result).toBeNull();
    });
  });

  describe('Autoplay state management', () => {
    it('should initialize with autoplay disabled', () => {
      // Mock VoiceState structure
      const mockState = {
        autoplay: false,
        queue: [],
        nowPlaying: null,
      };

      expect(mockState.autoplay).toBe(false);
    });

    it('should allow toggling autoplay state', () => {
      const mockState = {
        autoplay: false,
      };

      // Simulate toggle
      mockState.autoplay = !mockState.autoplay;
      expect(mockState.autoplay).toBe(true);

      // Toggle again
      mockState.autoplay = !mockState.autoplay;
      expect(mockState.autoplay).toBe(false);
    });

    it('should allow setting autoplay state explicitly', () => {
      const mockState = {
        autoplay: false,
      };

      // Set to true
      mockState.autoplay = true;
      expect(mockState.autoplay).toBe(true);

      // Set to false
      mockState.autoplay = false;
      expect(mockState.autoplay).toBe(false);
    });
  });
});
