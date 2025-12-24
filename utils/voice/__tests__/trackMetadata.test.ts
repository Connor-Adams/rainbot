import { detectUrlType, isValidHostname } from '../trackMetadata';

describe('trackMetadata', () => {
  describe('isValidHostname', () => {
    it('matches exact hostname', () => {
      expect(isValidHostname('youtube.com', 'youtube.com')).toBe(true);
    });

    it('matches subdomain with dot prefix', () => {
      expect(isValidHostname('www.youtube.com', 'youtube.com')).toBe(true);
      expect(isValidHostname('m.youtube.com', 'youtube.com')).toBe(true);
    });

    it('does not match partial hostname without dot', () => {
      expect(isValidHostname('notyoutube.com', 'youtube.com')).toBe(false);
    });

    it('does not match unrelated hostname', () => {
      expect(isValidHostname('spotify.com', 'youtube.com')).toBe(false);
    });

    it('handles nested subdomains', () => {
      expect(isValidHostname('music.www.youtube.com', 'youtube.com')).toBe(true);
    });
  });

  describe('detectUrlType', () => {
    describe('YouTube detection', () => {
      it('detects standard YouTube video URL', () => {
        expect(detectUrlType('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('yt_video');
      });

      it('detects shortened youtu.be URL', () => {
        expect(detectUrlType('https://youtu.be/dQw4w9WgXcQ')).toBe('yt_video');
      });

      it('detects YouTube playlist with list parameter', () => {
        expect(detectUrlType('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe('yt_playlist');
      });

      it('detects mobile YouTube URL', () => {
        expect(detectUrlType('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('yt_video');
      });

      it('detects youtube.com without www', () => {
        expect(detectUrlType('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('yt_video');
      });
    });

    describe('Spotify detection', () => {
      it('detects Spotify track URL', () => {
        expect(detectUrlType('https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp')).toBe('sp_track');
      });

      it('detects Spotify playlist URL', () => {
        expect(detectUrlType('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe('sp_playlist');
      });

      it('detects Spotify album URL', () => {
        expect(detectUrlType('https://open.spotify.com/album/2fenSS68JI1h4Fo296JfGr')).toBe('sp_album');
      });

      it('detects spotify.com without open subdomain', () => {
        expect(detectUrlType('https://spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp')).toBe('sp_track');
      });
    });

    describe('Invalid URLs', () => {
      it('returns null for non-URL strings', () => {
        expect(detectUrlType('not a url')).toBe(null);
      });

      it('returns null for unknown domains', () => {
        expect(detectUrlType('https://example.com/video')).toBe(null);
      });

      it('returns null for Spotify URL with unknown path', () => {
        expect(detectUrlType('https://open.spotify.com/unknown/12345')).toBe(null);
      });

      it('returns null for empty string', () => {
        expect(detectUrlType('')).toBe(null);
      });
    });
  });
});
