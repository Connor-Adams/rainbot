/**
 * Track Fetcher - Handles track metadata fetching and URL validation
 */
import play from 'play-dl';
import path from 'node:path';
import youtubedlPkg from 'youtube-dl-exec';
import { createLogger } from '../logger.ts';
import * as storage from '../storage.ts';
import type { Track } from '../../types/voice.ts';
import process from 'node:process';

const log = createLogger('FETCHER');

// Use system yt-dlp if available
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');

/**
 * Fetch tracks from a source (URL, search query, or local file)
 */
export async function fetchTracks(source: string, _guildId: string): Promise<Track[]> {
  const tracks: Track[] = [];

  // Check if it's a URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new Error('Invalid URL format');
    }

    // Fast URL type detection
    let urlType: string | false | undefined;
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      if (url.searchParams.has('list')) {
        urlType = 'yt_playlist';
      } else {
        urlType = 'yt_video';
      }
    } else if (url.hostname.includes('spotify.com') || url.hostname.includes('open.spotify.com')) {
      const pathParts = url.pathname.split('/').filter((p) => p);
      if (pathParts[0] === 'track') {
        urlType = 'sp_track';
      } else if (pathParts[0] === 'playlist') {
        urlType = 'sp_playlist';
      } else if (pathParts[0] === 'album') {
        urlType = 'sp_album';
      } else {
        urlType = await play.validate(source);
      }
    } else {
      urlType = await play.validate(source);
    }

    if (!urlType) {
      throw new Error('Unsupported URL. Supported: YouTube, SoundCloud, Spotify');
    }

    // Handle YouTube video
    if (urlType === 'yt_video') {
      // Clean playlist parameter if present
      let cleanSource = source;
      if (url.hostname.includes('youtube.com') && url.searchParams.has('list')) {
        cleanSource = `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
      }

      // Fetch actual video info to get the title
      let title = 'Unknown Track';
      let duration: number | undefined;
      try {
        const videoInfo = await play.video_basic_info(cleanSource);
        if (videoInfo?.video_details) {
          title = videoInfo.video_details.title || 'Unknown Track';
          duration = videoInfo.video_details.durationInSec;
          log.info(`Fetched video info: "${title}"`);
        }
      } catch (error) {
        log.warn(`Could not fetch video info: ${(error as Error).message}`);
      }

      tracks.push({
        title,
        url: cleanSource,
        duration,
        isLocal: false,
      });
    }
    // TODO: Handle playlists, Spotify, SoundCloud
    else {
      log.warn(`URL type ${urlType} not fully implemented yet`);

      // Try to get video info for YouTube-like URLs
      let title = 'Unknown Track';
      let duration: number | undefined;
      if (urlType?.startsWith('yt_') || urlType === 'so_track') {
        try {
          const videoInfo = await play.video_basic_info(source);
          if (videoInfo?.video_details) {
            title = videoInfo.video_details.title || 'Unknown Track';
            duration = videoInfo.video_details.durationInSec;
          }
        } catch {
          // Fall back to Unknown Track
        }
      }

      tracks.push({
        title,
        url: source,
        duration,
        isLocal: false,
      });
    }
  } else {
    // Check if it's a local sound file
    const exists = await storage.soundExists(source);
    if (exists) {
      tracks.push({
        title: path.basename(source, path.extname(source)),
        source: source,
        isLocal: true,
        isSoundboard: true,
      });
    } else {
      // Treat as search query
      log.info(`Searching YouTube for: "${source}"`);
      try {
        const ytResults = await play.search(source, { limit: 1 });
        const result = ytResults?.[0];
        if (result) {
          tracks.push({
            title: result.title || source,
            url: result.url,
            duration: result.durationInSec || undefined,
            isLocal: false,
          });
          log.info(`Found YouTube result: "${result.title}"`);
        } else {
          throw new Error(`No results found for: ${source}`);
        }
      } catch (error) {
        log.error(`Search error: ${(error as Error).message}`);
        throw new Error(
          `Could not find "${source}". Try a different search term or provide a direct URL.`
        );
      }
    }
  }

  return tracks;
}

/**
 * Get a related track for autoplay (based on the last played track).
 * Attempts to use YouTube's built-in related videos metadata from yt-dlp,
 * falling back to search-based approach if related videos are unavailable.
 */
export async function getRelatedTrack(lastTrack: Track): Promise<Track | null> {
  try {
    // Only support YouTube URLs for now
    if (!lastTrack.url) {
      log.debug('Cannot get related track: no URL provided');
      return null;
    }

    let youtubeHost = '';
    try {
      const parsed = new URL(lastTrack.url);
      youtubeHost = parsed.hostname.toLowerCase();
    } catch {
      log.debug('Cannot get related track: invalid URL');
      return null;
    }

    const allowedYoutubeHosts = new Set([
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
    ]);

    const isYoutubeHost =
      allowedYoutubeHosts.has(youtubeHost) ||
      (youtubeHost.endsWith('.youtube.com') && youtubeHost.length > 'youtube.com'.length);

    if (!isYoutubeHost) {
      log.debug('Cannot get related track: not a YouTube URL');
      return null;
    }

    log.info(`Finding related track for: "${lastTrack.title}"`);

    try {
      // Get video info which includes related videos metadata from YouTube
      const info = (await youtubedl(lastTrack.url, {
        dumpSingleJson: true,
        noPlaylist: true,
        noWarnings: true,
        quiet: true,
      })) as {
        title?: string;
        duration?: number;
        webpage_url?: string;
        related_videos?: Array<{
          id?: string;
          title?: string;
          url?: string;
          duration?: number;
        }>;
      };

      // First, try to use YouTube's actual related videos metadata
      if (info.related_videos && info.related_videos.length > 0) {
        log.debug(`Found ${info.related_videos.length} related videos from YouTube metadata`);

        for (const relatedVideo of info.related_videos) {
          // Skip videos without proper data
          if (!relatedVideo.id && !relatedVideo.url) {
            continue;
          }

          // Construct the URL if only ID is provided
          const videoUrl = relatedVideo.url || `https://www.youtube.com/watch?v=${relatedVideo.id}`;

          // Skip if it's the same video
          if (videoUrl === lastTrack.url) {
            continue;
          }

          log.info(`Found related track from YouTube metadata: "${relatedVideo.title}"`);
          return {
            title: relatedVideo.title || 'Unknown Track',
            url: videoUrl,
            duration: relatedVideo.duration,
            isLocal: false,
          };
        }
      }

      // Fallback: use search with the video title if no related videos found
      log.debug('No related videos in metadata, falling back to search');
      // Use the title from yt-dlp if available, otherwise use lastTrack.title
      const searchQuery = info.title || lastTrack.title;
      log.debug(`Searching for similar tracks: "${searchQuery}"`);

      const ytResults = await play.search(searchQuery, { limit: 5 });

      if (!ytResults || ytResults.length === 0) {
        log.warn('No search results found for autoplay');
        return null;
      }

      // Skip the first result if it's the same as the current video
      for (const result of ytResults) {
        if (result.url !== lastTrack.url) {
          log.info(`Found related track via search: "${result.title}"`);
          return {
            title: result.title || 'Unknown Track',
            url: result.url,
            duration: result.durationInSec || undefined,
            isLocal: false,
          };
        }
      }

      log.warn('No different related track found');
      return null;
    } catch (error) {
      const err = error as Error;
      // Handle specific error cases
      if (err.message.includes('403') || err.message.includes('Forbidden')) {
        log.error('YouTube access forbidden - autoplay may require authentication');
      } else if (err.message.includes('429') || err.message.includes('rate limit')) {
        log.error('Rate limited by YouTube - autoplay temporarily unavailable');
      } else if (err.message.includes('unavailable') || err.message.includes('deleted')) {
        log.warn('Video unavailable for autoplay source');
      } else {
        log.error(`Error getting related track: ${err.message}`);
      }
      return null;
    }
  } catch (error) {
    log.error(`Failed to get related track: ${(error as Error).message}`);
    return null;
  }
}
