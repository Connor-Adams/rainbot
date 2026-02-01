import play from 'play-dl';
import youtubedlPkg from 'youtube-dl-exec';
import { createLogger } from '../logger';
import type { VoiceState } from '@rainbot/types/voice-modules';

const log = createLogger('TRACK_METADATA');

// Use system yt-dlp if available
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');

export interface TrackMetadata {
  title: string;
  duration?: number;
  url: string;
  spotifyId?: string;
  spotifyUrl?: string;
}

export interface PlaylistMetadata {
  title: string;
  entries: unknown[];
}

export interface SpotifyTrack {
  name: string;
  artists: Array<{ name?: string }>;
  durationInMs?: number;
  id?: string;
  url?: string;
}

/**
 * Fetch YouTube video metadata
 */
export async function fetchYouTubeMetadata(url: string): Promise<TrackMetadata> {
  try {
    const info = (await youtubedl(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      noWarnings: true,
      quiet: true,
    })) as { title?: string; duration?: number };
    return {
      title: info.title || 'Unknown Track',
      duration: info.duration,
      url: url,
    };
  } catch (error) {
    const err = error as Error;
    log.warn(`Could not fetch video info: ${err.message}`);
    return {
      title: 'Unknown Track',
      url: url,
    };
  }
}

/**
 * Fetch YouTube playlist metadata
 */
export async function fetchYouTubePlaylist(url: string): Promise<PlaylistMetadata> {
  const info = (await youtubedl(url, {
    dumpSingleJson: true,
    flatPlaylist: true,
    noWarnings: true,
    quiet: true,
  })) as { title?: string; entries?: unknown[] };
  return {
    title: info.title || 'Unknown Playlist',
    entries: info.entries || [],
  };
}

/**
 * Search YouTube for a query
 */
export async function searchYouTube(query: string, limit: number = 1): Promise<TrackMetadata[]> {
  const results = await play.search(query, { limit });
  return results.map((result) => ({
    title: result.title || query,
    url: result.url,
    duration: result.durationInSec || undefined,
  }));
}

/**
 * Process Spotify track to YouTube equivalent
 */
export async function spotifyToYouTube(spotifyTrack: SpotifyTrack): Promise<TrackMetadata> {
  const searchQuery = `${spotifyTrack.name} ${spotifyTrack.artists[0]?.name || ''}`;
  log.debug(`Searching YouTube for Spotify track: ${searchQuery}`);

  const ytResults = await play.search(searchQuery, { limit: 1 });
  const ytResult = ytResults?.[0];
  if (ytResult) {
    return {
      title: `${spotifyTrack.name} - ${spotifyTrack.artists[0]?.name || 'Unknown Artist'}`,
      url: ytResult.url,
      duration: Math.floor((spotifyTrack.durationInMs || 0) / 1000),
      spotifyId: spotifyTrack.id,
      spotifyUrl: spotifyTrack.url,
    };
  }
  throw new Error(`Could not find YouTube equivalent for: ${spotifyTrack.name}`);
}

/**
 * Process Spotify playlist/album tracks in background
 */
export async function processSpotifyPlaylistTracks(
  spotifyTracks: SpotifyTrack[],
  state: VoiceState,
  _guildId: string
): Promise<void> {
  let added = 0;
  let failed = 0;

  for (const spotifyTrack of spotifyTracks) {
    try {
      const track = await spotifyToYouTube(spotifyTrack);
      state.queue.push({
        ...track,
        isLocal: false,
        userId: state.lastUserId || undefined,
        username: state.lastUsername || undefined,
        discriminator: state.lastDiscriminator || undefined,
        source: 'discord',
      });
      added++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      failed++;
      const err = error as Error;
      log.error(`Error processing Spotify track ${spotifyTrack.name}: ${err.message}`);
    }
  }

  log.info(`Added ${added} tracks from Spotify (${failed} failed)`);
}

import { extractYouTubeVideoId } from '@rainbot/shared';

/**
 * Check if hostname matches expected domain
 */
export function isValidHostname(hostname: string, expectedDomain: string): boolean {
  // Exact match
  if (hostname === expectedDomain) return true;
  // Subdomain match (e.g., www.youtube.com, m.youtube.com)
  if (hostname.endsWith('.' + expectedDomain)) return true;
  return false;
}

export type UrlType = 'yt_video' | 'yt_playlist' | 'sp_track' | 'sp_playlist' | 'sp_album' | null;

/**
 * Detect URL type quickly (YouTube, Spotify)
 */
export function detectUrlType(source: string): UrlType {
  try {
    const url = new URL(source);
    const hostname = url.hostname.toLowerCase();

    // YouTube: use extractYouTubeVideoId for video detection; pure /playlist?list= = playlist
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      if (extractYouTubeVideoId(source)) return 'yt_video';
      if (url.pathname.includes('/playlist') && url.searchParams.has('list')) {
        return 'yt_playlist';
      }
      return null;
    }

    // Spotify detection - check hostname properly
    if (isValidHostname(hostname, 'spotify.com') || isValidHostname(hostname, 'open.spotify.com')) {
      const pathParts = url.pathname.split('/').filter((p) => p);
      if (pathParts[0] === 'track') return 'sp_track';
      if (pathParts[0] === 'playlist') return 'sp_playlist';
      if (pathParts[0] === 'album') return 'sp_album';
    }

    return null;
  } catch {
    return null;
  }
}
