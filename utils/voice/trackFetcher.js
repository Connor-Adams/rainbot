const play = require('play-dl');
const youtubedlPkg = require('youtube-dl-exec');
const { createLogger } = require('../logger');
const { getStreamUrl } = require('./audioResource');

const log = createLogger('TRACK_FETCHER');

// Use system yt-dlp if available
const youtubedl = youtubedlPkg.create(process.env.YTDLP_PATH || 'yt-dlp');

/**
 * Check if hostname matches expected domain
 * @param {string} hostname - URL hostname
 * @param {string} expectedDomain - Expected domain (e.g., 'youtube.com')
 * @returns {boolean} True if hostname matches or is a subdomain of expectedDomain
 */
function isValidHostname(hostname, expectedDomain) {
    // Exact match
    if (hostname === expectedDomain) return true;
    // Subdomain match (e.g., www.youtube.com, m.youtube.com)
    if (hostname.endsWith('.' + expectedDomain)) return true;
    return false;
}

/**
 * Fetch YouTube video metadata
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} Video info
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
 * Fetch YouTube playlist
 * @param {string} url - Playlist URL
 * @param {Function} onFirstTrack - Callback for first track
 * @param {Function} onRemainingTracks - Callback for remaining tracks
 */
async function fetchYouTubePlaylist(url, onFirstTrack, onRemainingTracks) {
    const urlObj = new URL(url);
    const firstVideoId = urlObj.searchParams.get('v');
    
    // Queue first track immediately
    if (firstVideoId && onFirstTrack) {
        const firstTrack = {
            title: 'Loading playlist...',
            url: `https://www.youtube.com/watch?v=${firstVideoId}`,
            isLocal: false,
        };
        onFirstTrack(firstTrack);
        
        // Pre-fetch stream URL
        getStreamUrl(firstTrack.url).catch(err => log.debug(`Pre-fetch failed: ${err.message}`));
    }
    
    // Fetch full playlist in background
    youtubedl(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
        quiet: true,
    }).then(playlistInfo => {
        const entries = playlistInfo.entries || [];
        const tracks = [];
        
        for (const video of entries) {
            const videoUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
            
            // Skip first video if already queued
            if (firstVideoId && video.id === firstVideoId) {
                continue;
            }
            
            tracks.push({
                title: video.title || 'Unknown Track',
                url: videoUrl,
                duration: video.duration,
                isLocal: false,
            });
        }
        
        if (onRemainingTracks && tracks.length > 0) {
            onRemainingTracks(tracks);
        }
        
        log.info(`Fetched ${tracks.length} tracks from playlist: ${playlistInfo.title}`);
    }).catch(e => {
        log.error(`Failed to fetch playlist: ${e.message}`);
    });
}

/**
 * Process Spotify tracks (search YouTube equivalents)
 * @param {Array} spotifyTracks - Array of Spotify track objects
 * @param {Function} onTrackFound - Callback for each found track
 */
async function processSpotifyTracks(spotifyTracks, onTrackFound) {
    let added = 0;
    let failed = 0;
    
    for (const spotifyTrack of spotifyTracks) {
        try {
            const searchQuery = `${spotifyTrack.name} ${spotifyTrack.artists[0]?.name || ''}`;
            const ytResults = await play.search(searchQuery, { limit: 1 });
            
            if (ytResults && ytResults.length > 0) {
                const track = {
                    title: `${spotifyTrack.name} - ${spotifyTrack.artists[0]?.name || 'Unknown Artist'}`,
                    url: ytResults[0].url,
                    duration: Math.floor((spotifyTrack.durationInMs || 0) / 1000),
                    isLocal: false,
                    spotifyId: spotifyTrack.id,
                    spotifyUrl: spotifyTrack.url,
                };
                
                if (onTrackFound) {
                    onTrackFound(track);
                }
                added++;
            } else {
                failed++;
                log.warn(`Could not find YouTube equivalent for: ${spotifyTrack.name}`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            failed++;
            log.error(`Error processing Spotify track ${spotifyTrack.name}: ${error.message}`);
        }
    }
    
    log.info(`Processed Spotify tracks: ${added} added, ${failed} failed`);
    return { added, failed };
}

/**
 * Search YouTube for a query
 * @param {string} query - Search query
 * @returns {Promise<Object>} First result track
 */
async function searchYouTube(query) {
    log.info(`Searching YouTube for: "${query}"`);
    const ytResults = await play.search(query, { limit: 1 });
    
    if (!ytResults || ytResults.length === 0) {
        throw new Error(`No results found for: ${query}`);
    }
    
    const result = ytResults[0];
    log.info(`Found YouTube result: "${result.title}"`);
    
    return {
        title: result.title || query,
        url: result.url,
        duration: result.durationInSec || null,
        isLocal: false,
    };
}

/**
 * Detect URL type quickly (without HTTP requests for YT/Spotify)
 * @param {string} url - URL to check
 * @returns {Promise<string|null>} URL type
 */
async function detectUrlType(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // YouTube detection - check hostname properly
        if (isValidHostname(hostname, 'youtube.com') || 
            isValidHostname(hostname, 'youtu.be') ||
            isValidHostname(hostname, 'www.youtube.com') ||
            isValidHostname(hostname, 'm.youtube.com')) {
            if (urlObj.searchParams.has('list')) {
                return 'yt_playlist';
            }
            return 'yt_video';
        }
        
        // Spotify detection - check hostname properly
        if (isValidHostname(hostname, 'spotify.com') || 
            isValidHostname(hostname, 'open.spotify.com')) {
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            if (pathParts[0] === 'track') return 'sp_track';
            if (pathParts[0] === 'playlist') return 'sp_playlist';
            if (pathParts[0] === 'album') return 'sp_album';
        }
        
        // Fall back to play-dl validation for other platforms
        return await play.validate(url);
    } catch {
        return null;
    }
}

module.exports = {
    fetchYouTubeMetadata,
    fetchYouTubePlaylist,
    processSpotifyTracks,
    searchYouTube,
    detectUrlType,
};
