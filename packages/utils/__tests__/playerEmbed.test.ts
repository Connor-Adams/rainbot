import { formatDuration, getYouTubeThumbnail, createPlayerEmbed } from '../playerEmbed';
import type { Track } from '@rainbot/protocol';

describe('playerEmbed', () => {
  describe('formatDuration', () => {
    it('formats seconds only', () => {
      expect(formatDuration(45)).toBe('0:45');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(125)).toBe('2:05');
    });

    it('formats hours, minutes, and seconds', () => {
      expect(formatDuration(3661)).toBe('1:01:01');
    });

    it('pads single digit seconds', () => {
      expect(formatDuration(65)).toBe('1:05');
    });

    it('pads single digit minutes in hour format', () => {
      expect(formatDuration(3605)).toBe('1:00:05');
    });

    it('handles zero duration', () => {
      expect(formatDuration(0)).toBe(null);
    });

    it('handles null duration', () => {
      expect(formatDuration(null)).toBe(null);
    });

    it('handles undefined duration', () => {
      expect(formatDuration(undefined)).toBe(null);
    });

    it('handles NaN', () => {
      expect(formatDuration(NaN)).toBe(null);
    });

    it('formats long durations correctly', () => {
      expect(formatDuration(7265)).toBe('2:01:05'); // 2 hours, 1 minute, 5 seconds
    });

    it('handles exactly 1 hour', () => {
      expect(formatDuration(3600)).toBe('1:00:00');
    });
  });

  describe('getYouTubeThumbnail', () => {
    it('extracts video ID from standard youtube.com URL', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(getYouTubeThumbnail(url)).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
    });

    it('extracts video ID from youtu.be URL', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(getYouTubeThumbnail(url)).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
    });

    it('extracts video ID with additional query parameters', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxx&index=1';
      expect(getYouTubeThumbnail(url)).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
    });

    it('handles URL with timestamp parameter', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s';
      expect(getYouTubeThumbnail(url)).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
    });

    it('returns null for non-YouTube URLs', () => {
      expect(getYouTubeThumbnail('https://spotify.com/track/123')).toBe(null);
    });

    it('returns null for invalid YouTube URLs', () => {
      expect(getYouTubeThumbnail('https://youtube.com/notavalidurl')).toBe(null);
    });

    it('returns null for null input', () => {
      expect(getYouTubeThumbnail(null)).toBe(null);
    });

    it('returns null for undefined input', () => {
      expect(getYouTubeThumbnail(undefined)).toBe(null);
    });

    it('returns null for empty string', () => {
      expect(getYouTubeThumbnail('')).toBe(null);
    });

    it('handles video IDs with underscores and hyphens', () => {
      const url = 'https://www.youtube.com/watch?v=abc-123_XYZ';
      expect(getYouTubeThumbnail(url)).toBe(
        'https://img.youtube.com/vi/abc-123_XYZ/maxresdefault.jpg'
      );
    });

    it('extracts correct 11-character video ID', () => {
      const url = 'https://youtu.be/12345678901';
      expect(getYouTubeThumbnail(url)).toBe(
        'https://img.youtube.com/vi/12345678901/maxresdefault.jpg'
      );
    });
  });

  describe('createPlayerEmbed', () => {
    it('creates embed with nothing playing', () => {
      const embed = createPlayerEmbed(null, [], false, null);

      expect(embed).toBeDefined();
      expect(embed.data.color).toBeDefined();
      expect(embed.data.timestamp).toBeDefined();
    });

    it('creates embed with current track', () => {
      const currentTrack: Track = {
        title: 'Test Song',
        url: 'https://youtube.com/watch?v=test123',
        isLocal: false,
        duration: 180,
      };

      const embed = createPlayerEmbed('Test Song', [], false, currentTrack);

      expect(embed).toBeDefined();
    });

    it('sets orange color when paused', () => {
      const embed = createPlayerEmbed('Test Song', [], true, null);

      expect(embed.data.color).toBe(0xf59e0b); // Orange
    });

    it('sets purple color when overlay is active', () => {
      const embed = createPlayerEmbed('Test Song', [], false, null, { hasOverlay: true });

      expect(embed.data.color).toBe(0x8b5cf6); // Purple
    });

    it('sets blue color by default', () => {
      const embed = createPlayerEmbed('Test Song', [], false, null);

      expect(embed.data.color).toBe(0x6366f1); // Blue
    });

    it('includes queue information', () => {
      const queue: Track[] = [
        { title: 'Track 1', url: 'url1', isLocal: false },
        { title: 'Track 2', url: 'url2', isLocal: false },
      ];

      const embed = createPlayerEmbed('Current Track', queue, false, null);

      expect(embed).toBeDefined();
    });

    it('handles empty queue', () => {
      const embed = createPlayerEmbed('Current Track', [], false, null);

      expect(embed).toBeDefined();
    });

    it('includes channel name when provided', () => {
      const embed = createPlayerEmbed('Test Song', [], false, null, {
        channelName: 'General Voice',
      });

      expect(embed).toBeDefined();
    });
  });
});
