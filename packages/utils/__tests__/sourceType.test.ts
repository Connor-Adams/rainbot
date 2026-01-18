import { detectSourceType, TrackForSourceDetection } from '../src/sourceType';

describe('sourceType', () => {
  describe('detectSourceType', () => {
    it('detects local files', () => {
      const track: TrackForSourceDetection = {
        isLocal: true,
        url: '/path/to/local/file.mp3',
      };
      expect(detectSourceType(track)).toBe('local');
    });

    it('detects YouTube URLs with youtube.com domain', () => {
      const track: TrackForSourceDetection = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };
      expect(detectSourceType(track)).toBe('youtube');
    });

    it('detects YouTube URLs with youtu.be domain', () => {
      const track: TrackForSourceDetection = {
        url: 'https://youtu.be/dQw4w9WgXcQ',
      };
      expect(detectSourceType(track)).toBe('youtube');
    });

    it('detects YouTube URLs case-insensitively', () => {
      const track: TrackForSourceDetection = {
        url: 'https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ',
      };
      expect(detectSourceType(track)).toBe('youtube');
    });

    it('detects Spotify URLs', () => {
      const track: TrackForSourceDetection = {
        url: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
      };
      expect(detectSourceType(track)).toBe('spotify');
    });

    it('detects Spotify tracks by spotifyId', () => {
      const track: TrackForSourceDetection = {
        spotifyId: '3n3Ppam7vgaVa1iaRUc9Lp',
        url: 'https://example.com',
      };
      expect(detectSourceType(track)).toBe('spotify');
    });

    it('detects SoundCloud URLs', () => {
      const track: TrackForSourceDetection = {
        url: 'https://soundcloud.com/artist/track',
      };
      expect(detectSourceType(track)).toBe('soundcloud');
    });

    it('returns "other" for unknown URLs', () => {
      const track: TrackForSourceDetection = {
        url: 'https://example.com/audio.mp3',
      };
      expect(detectSourceType(track)).toBe('other');
    });

    it('returns "other" when url is missing', () => {
      const track: TrackForSourceDetection = {};
      expect(detectSourceType(track)).toBe('other');
    });

    it('prioritizes isLocal over URL content', () => {
      const track: TrackForSourceDetection = {
        isLocal: true,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };
      expect(detectSourceType(track)).toBe('local');
    });
  });
});
