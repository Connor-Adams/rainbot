const play = require('play-dl');
const youtubedlPkg = require('youtube-dl-exec');
const { createLogger } = require('../logger');

const log = createLogger('TRACK_METADATA');

// Use system yt-dlp if available
const youtubedl = youtubedlPkg.create(process.env.YTDLP_PATH || 'yt-dlp');

/**
 * Fetch YouTube video metadata
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} Video metadata
 */
async function fetchYouTubeMetadata(url) {
    try {
        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noPlaylist: true,
            noWarnings: true,
            quiet: true,
        });
        return {
            title: info.title || 'Unknown Track',
            duration: info.duration,
            url: url,
        };
    } catch (error) {
        log.warn(`Could not fetch video info: ${error.message}`);
        return {
            title: 'Unknown Track',
            url: url,
        };
    }
}

/**
 * Fetch YouTube playlist metadata
 * @param {string} url - YouTube playlist URL
 * @returns {Promise<Object>} Playlist info with entries
 */
async function fetchYouTubePlaylist(url) {
    const info = await youtubedl(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
        quiet: true,
    });
    return {
        title: info.title,
        entries: info.entries || [],
    };
}

/**
 * Search YouTube for a query
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} Search results
 */
async function searchYouTube(query, limit = 1) {
    const results = await play.search(query, { limit });
    return results.map(result => ({
        title: result.title || query,
        url: result.url,
        duration: result.durationInSec || null,
    }));
}

/**
 * Process Spotify track to YouTube equivalent
 * @param {Object} spotifyTrack - Spotify track object
 * @returns {Promise<Object>} Track info
 */
async function spotifyToYouTube(spotifyTrack) {
    const searchQuery = `${spotifyTrack.name} ${spotifyTrack.artists[0]?.name || ''}`;
    log.debug(`Searching YouTube for Spotify track: ${searchQuery}`);
    
    const ytResults = await play.search(searchQuery, { limit: 1 });
    if (ytResults && ytResults.length > 0) {
        return {
            title: `${spotifyTrack.name} - ${spotifyTrack.artists[0]?.name || 'Unknown Artist'}`,
            url: ytResults[0].url,
            duration: Math.floor((spotifyTrack.durationInMs || 0) / 1000),
            spotifyId: spotifyTrack.id,
            spotifyUrl: spotifyTrack.url,
        };
    }
    throw new Error(`Could not find YouTube equivalent for: ${spotifyTrack.name}`);
}

/**
 * Process Spotify playlist/album tracks in background
 * @param {Array} spotifyTracks - Array of Spotify track objects
 * @param {Object} state - Voice state
 * @param {string} guildId - Guild ID
 */
async function processSpotifyPlaylistTracks(spotifyTracks, state, guildId) {
    let added = 0;
    let failed = 0;
    
    for (const spotifyTrack of spotifyTracks) {
        try {
            const track = await spotifyToYouTube(spotifyTrack);
            state.queue.push({
                ...track,
                isLocal: false,
                userId: state.lastUserId || null,
                username: state.lastUsername || null,
                discriminator: state.lastDiscriminator || null,
                source: 'discord',
            });
            added++;
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            failed++;
            log.error(`Error processing Spotify track ${spotifyTrack.name}: ${error.message}`);
        }
    }
    
    log.info(`Added ${added} tracks from Spotify (${failed} failed)`);
}

/**
 * Detect URL type quickly (YouTube, Spotify)
 * @param {string} source - URL or search query
 * @returns {string|null} URL type or null
 */
function detectUrlType(source) {
    try {
        const url = new URL(source);
        
        // YouTube detection
        if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
            if (url.searchParams.has('list')) {
                return 'yt_playlist';
            }
            return 'yt_video';
        }
        
        // Spotify detection
        if (url.hostname.includes('spotify.com') || url.hostname.includes('open.spotify.com')) {
            const pathParts = url.pathname.split('/').filter(p => p);
            if (pathParts[0] === 'track') return 'sp_track';
            if (pathParts[0] === 'playlist') return 'sp_playlist';
            if (pathParts[0] === 'album') return 'sp_album';
        }
        
        return null;
    } catch {
        return null;
    }
}

module.exports = {
    fetchYouTubeMetadata,
    fetchYouTubePlaylist,
    searchYouTube,
    spotifyToYouTube,
    processSpotifyPlaylistTracks,
    detectUrlType,
};
