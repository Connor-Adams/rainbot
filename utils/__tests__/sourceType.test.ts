import { detectSourceType, type TrackForSourceDetection } from '../sourceType';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// sourceType tests
Deno.test('detectSourceType - detects local files', () => {
  const track: TrackForSourceDetection = {
    isLocal: true,
    url: '/path/to/local/file.mp3',
  };
  assertEquals(detectSourceType(track), 'local');
});

Deno.test('detectSourceType - detects YouTube URLs with youtube.com domain', () => {
  const track: TrackForSourceDetection = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  assertEquals(detectSourceType(track), 'youtube');
});

Deno.test('detectSourceType - detects YouTube URLs with youtu.be domain', () => {
  const track: TrackForSourceDetection = {
    url: 'https://youtu.be/dQw4w9WgXcQ',
  };
  assertEquals(detectSourceType(track), 'youtube');
});

Deno.test('detectSourceType - detects YouTube URLs case-insensitively', () => {
  const track: TrackForSourceDetection = {
    url: 'https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ',
  };
  assertEquals(detectSourceType(track), 'youtube');
});

Deno.test('detectSourceType - detects Spotify URLs', () => {
  const track: TrackForSourceDetection = {
    url: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
  };
  assertEquals(detectSourceType(track), 'spotify');
});

Deno.test('detectSourceType - detects Spotify tracks by spotifyId', () => {
  const track: TrackForSourceDetection = {
    spotifyId: '3n3Ppam7vgaVa1iaRUc9Lp',
    url: 'https://example.com',
  };
  assertEquals(detectSourceType(track), 'spotify');
});

Deno.test('detectSourceType - detects SoundCloud URLs', () => {
  const track: TrackForSourceDetection = {
    url: 'https://soundcloud.com/artist/track',
  };
  assertEquals(detectSourceType(track), 'soundcloud');
});

Deno.test('detectSourceType - returns "other" for unknown URLs', () => {
  const track: TrackForSourceDetection = {
    url: 'https://example.com/audio.mp3',
  };
  assertEquals(detectSourceType(track), 'other');
});

Deno.test('detectSourceType - returns "other" when url is missing', () => {
  const track: TrackForSourceDetection = {};
  assertEquals(detectSourceType(track), 'other');
});

Deno.test('detectSourceType - prioritizes isLocal over URL content', () => {
  const track: TrackForSourceDetection = {
    isLocal: true,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  assertEquals(detectSourceType(track), 'local');
});
