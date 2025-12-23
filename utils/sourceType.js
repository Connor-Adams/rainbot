/**
 * Shared utility for detecting track source type
 */

/**
 * Detect the source type of a track based on its properties
 * @param {Object} track - Track object
 * @param {boolean} [track.isLocal] - Whether this is a local file
 * @param {string} [track.url] - Track URL
 * @param {string} [track.spotifyId] - Spotify track ID
 * @returns {'youtube'|'spotify'|'soundcloud'|'local'|'other'} Source type
 */
function detectSourceType(track) {
    if (track.isLocal) return 'local';
    if (!track.url) return 'other';

    const url = track.url.toLowerCase();
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('spotify.com') || track.spotifyId) return 'spotify';
    if (url.includes('soundcloud.com')) return 'soundcloud';

    return 'other';
}

module.exports = { detectSourceType };
