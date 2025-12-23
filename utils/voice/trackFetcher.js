/**
 * Track Fetcher - Handles track metadata fetching and URL validation
 */
const play = require('play-dl');
const path = require('path');
const { createLogger } = require('../logger');
const storage = require('../storage');

const log = createLogger('FETCHER');

/**
 * Fetch tracks from a source (URL, search query, or local file)
 * @param {string} source - Source URL or search query
 * @param {string} guildId - Guild ID
 * @returns {Promise<Array<Track>>} - Array of tracks
 */
async function fetchTracks(source, guildId) {
  const tracks = [];

  // Check if it's a URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    let url;
    try {
      url = new URL(source);
    } catch {
      throw new Error('Invalid URL format');
    }

    // Fast URL type detection
    let urlType;
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

    if (!urlType || urlType === false) {
      throw new Error('Unsupported URL. Supported: YouTube, SoundCloud, Spotify');
    }

    // Handle YouTube video
    if (urlType === 'yt_video') {
      // Clean playlist parameter if present
      if (url.hostname.includes('youtube.com') && url.searchParams.has('list')) {
        source = `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
      }
      
      tracks.push({
        title: 'Loading...',
        url: source,
        isLocal: false,
      });
    }
    // TODO: Handle playlists, Spotify, SoundCloud
    else {
      log.warn(`URL type ${urlType} not fully implemented yet`);
      tracks.push({
        title: 'Loading...',
        url: source,
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
        if (ytResults && ytResults.length > 0) {
          const result = ytResults[0];
          tracks.push({
            title: result.title || source,
            url: result.url,
            duration: result.durationInSec || null,
            isLocal: false,
          });
          log.info(`Found YouTube result: "${result.title}"`);
        } else {
          throw new Error(`No results found for: ${source}`);
        }
      } catch (error) {
        log.error(`Search error: ${error.message}`);
        throw new Error(
          `Could not find "${source}". Try a different search term or provide a direct URL.`
        );
      }
    }
  }

  return tracks;
}

module.exports = {
  fetchTracks,
};
