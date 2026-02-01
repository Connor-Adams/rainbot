import {
  extractYouTubeVideoId,
  toCanonicalYouTubeUrl,
  getYouTubeThumbnailUrl,
} from '../youtubeUrl';

describe('youtubeUrl', () => {
  describe('extractYouTubeVideoId', () => {
    it('extracts ID from standard watch URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      );
    });

    it('extracts ID from watch URL with list param (ignores list)', () => {
      expect(
        extractYouTubeVideoId(
          'https://www.youtube.com/watch?v=Z52QLyqMlTE&list=PLCC4B57D97078A9FD&index=6'
        )
      ).toBe('Z52QLyqMlTE');
    });

    it('extracts ID from youtu.be short URL', () => {
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from youtu.be with params', () => {
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ');
    });

    it('extracts ID from m.youtube.com', () => {
      expect(extractYouTubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      );
    });

    it('extracts ID from music.youtube.com', () => {
      expect(extractYouTubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      );
    });

    it('extracts ID from embed URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      );
    });

    it('returns null for playlist URL (no video)', () => {
      expect(
        extractYouTubeVideoId(
          'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
        )
      ).toBe(null);
    });

    it('returns null for non-YouTube URL', () => {
      expect(extractYouTubeVideoId('https://example.com/video')).toBe(null);
    });

    it('returns null for null/undefined', () => {
      expect(extractYouTubeVideoId(null)).toBe(null);
      expect(extractYouTubeVideoId(undefined)).toBe(null);
    });
  });

  describe('toCanonicalYouTubeUrl', () => {
    it('returns canonical URL from watch URL', () => {
      expect(toCanonicalYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });

    it('strips list and index params', () => {
      expect(
        toCanonicalYouTubeUrl(
          'https://www.youtube.com/watch?v=Z52QLyqMlTE&list=PLCC4B57D97078A9FD&index=6'
        )
      ).toBe('https://www.youtube.com/watch?v=Z52QLyqMlTE');
    });

    it('converts youtu.be to canonical', () => {
      expect(toCanonicalYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });

    it('accepts raw video ID', () => {
      expect(toCanonicalYouTubeUrl('dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      );
    });

    it('returns null for playlist URL', () => {
      expect(toCanonicalYouTubeUrl('https://www.youtube.com/playlist?list=PLxxx')).toBe(null);
    });

    it('returns null for invalid input', () => {
      expect(toCanonicalYouTubeUrl('')).toBe(null);
      expect(toCanonicalYouTubeUrl(null)).toBe(null);
    });
  });

  describe('getYouTubeThumbnailUrl', () => {
    it('returns thumbnail URL from watch URL', () => {
      expect(getYouTubeThumbnailUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
    });

    it('returns thumbnail from URL with list param', () => {
      expect(
        getYouTubeThumbnailUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxx&index=1')
      ).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
    });

    it('returns thumbnail from raw video ID', () => {
      expect(getYouTubeThumbnailUrl('dQw4w9WgXcQ')).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
      );
    });

    it('returns null for non-video URL', () => {
      expect(getYouTubeThumbnailUrl('https://example.com')).toBe(null);
    });
  });
});
