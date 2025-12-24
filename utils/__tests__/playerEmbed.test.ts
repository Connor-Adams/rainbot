import { formatDuration, getYouTubeThumbnail } from '../playerEmbed';

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
});
