const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    StreamType,
} = require('@discordjs/voice');
const play = require('play-dl');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('./logger');

const log = createLogger('VOICE');

// Map of guildId -> { connection, player, nowPlaying, queue, preBuffered }
const voiceStates = new Map();

const storage = require('./storage');

// For backward compatibility, get sounds directory (null if using S3)
const SOUNDS_DIR = storage.getSoundsDir() || path.join(__dirname, '..', 'sounds');

/**
 * Create a resource for a track (YouTube or other)
 */
/**
 * Get direct stream URL from yt-dlp (cached for speed)
 */
const urlCache = new Map();

async function getStreamUrl(videoUrl) {
    // Check cache first (URLs are valid for a few hours)
    const cached = urlCache.get(videoUrl);
    if (cached && cached.expires > Date.now()) {
        log.debug(`Using cached stream URL for ${videoUrl}`);
        return cached.url;
    }
    
    // Get direct URL from yt-dlp
    const result = await youtubedl(videoUrl, {
        format: 'bestaudio[acodec=opus]/bestaudio/best',
        getUrl: true,
        noPlaylist: true,
        noWarnings: true,
        quiet: true,
        noCheckCertificates: true,
    });
    
    const streamUrl = typeof result === 'string' ? result.trim() : result;
    
    // Cache for 2 hours
    urlCache.set(videoUrl, { url: streamUrl, expires: Date.now() + 2 * 60 * 60 * 1000 });
    
    return streamUrl;
}

async function createTrackResourceAsync(track) {
    const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
        const streamUrl = await getStreamUrl(track.url);
        log.debug(`Got stream URL, starting fetch...`);
        
        // Stream directly with fetch (much faster than yt-dlp piping)
        const response = await fetch(streamUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity', // No compression for faster streaming
                'Range': 'bytes=0-', // Start from beginning
            },
        });
        
        if (!response.ok) {
            throw new Error(`Stream fetch failed: ${response.status}`);
        }
        
        const { Readable } = require('stream');
        const nodeStream = Readable.fromWeb(response.body);
        
        return {
            resource: createAudioResource(nodeStream, { inputType: StreamType.Arbitrary }),
        };
    }
    return null;
}

function createTrackResource(track) {
    const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
        const subprocess = youtubedl.exec(track.url, {
            format: 'bestaudio[acodec=opus]/bestaudio',
            output: '-',
            noPlaylist: true,
            noWarnings: true,
            quiet: true,
            noCheckCertificates: true,
            preferFreeFormats: true,
            bufferSize: '16K',
        });
        
        subprocess.catch(() => {});
        
        subprocess.stderr?.on('data', (data) => {
            const msg = data.toString().trim();
            if (!msg.includes('Broken pipe')) {
                log.debug(`yt-dlp: ${msg}`);
            }
        });
        
        return {
            resource: createAudioResource(subprocess.stdout, { inputType: StreamType.Arbitrary }),
            subprocess,
        };
    }
    return null;
}

/**
 * Pre-buffer the next track in the queue
 */
function preBufferNext(guildId) {
    const state = voiceStates.get(guildId);
    if (!state || state.queue.length === 0) return;
    
    const nextTrack = state.queue[0];
    if (!nextTrack || nextTrack.isLocal) return;
    
    // Only pre-buffer YouTube tracks
    const ytMatch = nextTrack.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!ytMatch) return;
    
    log.debug(`Pre-buffering: ${nextTrack.title}`);
    const buffered = createTrackResource(nextTrack);
    if (buffered) {
        state.preBuffered = { track: nextTrack, ...buffered };
    }
}

/**
 * Play the next track in the queue
 */
async function playNext(guildId) {
    const playStartTime = Date.now();
    const state = voiceStates.get(guildId);
    if (!state || state.queue.length === 0) {
        if (state) {
            state.nowPlaying = null;
            state.preBuffered = null;
        }
        return null;
    }

    const nextTrack = state.queue.shift();
    log.debug(`[TIMING] playNext: starting ${nextTrack.title}`);
    
    try {
        let resource;

        if (nextTrack.isLocal) {
            // Handle both file paths and streams
            if (nextTrack.isStream) {
                // Stream from storage (S3 or local stream)
                resource = createAudioResource(nextTrack.source, { inputType: StreamType.Arbitrary });
            } else {
                // File path (backward compatibility)
                resource = createAudioResource(nextTrack.source);
            }
        } else {
            // Check if we have this track pre-buffered
            if (state.preBuffered && state.preBuffered.track.url === nextTrack.url) {
                log.debug(`Using pre-buffered stream for: ${nextTrack.title}`);
                resource = state.preBuffered.resource;
                state.preBuffered = null;
            } else {
                // Kill old pre-buffer if it doesn't match
                if (state.preBuffered?.subprocess) {
                    state.preBuffered.subprocess.kill?.();
                    state.preBuffered = null;
                }
                
                log.debug(`Streaming: ${nextTrack.url}`);
                
                const ytMatch = nextTrack.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                if (ytMatch) {
                    // Use async version (checks cache, uses fetch for streaming)
                    const result = await createTrackResourceAsync(nextTrack);
                    resource = result.resource;
                } else {
                    // Use play-dl for other platforms (SoundCloud, etc.)
                    const urlType = await play.validate(nextTrack.url);
                    if (urlType) {
                        const streamInfo = await play.stream(nextTrack.url, { quality: 2 });
                        resource = createAudioResource(streamInfo.stream, {
                            inputType: streamInfo.type,
                        });
                    } else {
                        throw new Error('URL no longer valid');
                    }
                }
            }
        }

        log.debug(`[TIMING] playNext: resource created (${Date.now() - playStartTime}ms)`);
        state.player.play(resource);
        state.nowPlaying = nextTrack.title;
        log.debug(`[TIMING] playNext: player.play() called (${Date.now() - playStartTime}ms)`);
        log.info(`Now playing: ${nextTrack.title}`);
        
        // Pre-buffer the next track for instant skip
        setTimeout(() => preBufferNext(guildId), 500);
        
        return nextTrack;
    } catch (error) {
        log.error(`Failed to play ${nextTrack.title} (${nextTrack.url}): ${error.message}`);
        // Try next track
        return playNext(guildId);
    }
}

/**
 * Join a voice channel
 */
async function joinChannel(channel) {
    const guildId = channel.guild.id;

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();

    // Subscribe the connection to the player
    connection.subscribe(player);

    // Handle connection state changes
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            log.debug(`Reconnecting to voice in guild ${guildId}`);
        } catch (error) {
            log.info(`Disconnected from voice in guild ${guildId}`);
            connection.destroy();
            voiceStates.delete(guildId);
        }
    });

    // Handle player state changes - auto-play next track
    player.on(AudioPlayerStatus.Idle, () => {
        const state = voiceStates.get(guildId);
        if (state && state.queue.length > 0) {
            playNext(guildId);
        } else if (state) {
            state.nowPlaying = null;
        }
    });

    player.on('error', error => {
        log.error(`Audio player error: ${error.message}`);
        const state = voiceStates.get(guildId);
        if (state) {
            state.nowPlaying = null;
            // Try to play next track on error
            if (state.queue.length > 0) {
                playNext(guildId);
            }
        }
    });

    voiceStates.set(guildId, {
        connection,
        player,
        nowPlaying: null,
        queue: [],
        channelId: channel.id,
        channelName: channel.name,
    });

    log.info(`Joined voice channel: ${channel.name} (${channel.guild.name})`);

    return { connection, player };
}

/**
 * Leave a voice channel
 */
function leaveChannel(guildId) {
    const connection = getVoiceConnection(guildId);
    if (connection) {
        connection.destroy();
        voiceStates.delete(guildId);
        log.info(`Left voice channel in guild ${guildId}`);
        return true;
    }
    return false;
}

/**
 * Add track(s) to queue and start playing if not already
 */
async function playSound(guildId, source) {
    const startTime = Date.now();
    const state = voiceStates.get(guildId);
    if (!state) {
        throw new Error('Bot is not connected to a voice channel in this server');
    }

    if (!source || typeof source !== 'string') {
        throw new Error('Invalid source provided');
    }

    const tracks = [];
    log.debug(`[TIMING] playSound started`);

    // Check if it's a URL
    if (source.startsWith('http://') || source.startsWith('https://')) {
        let url;
        try {
            url = new URL(source);
        } catch (e) {
            throw new Error('Invalid URL format');
        }

        // Fast URL type detection for YouTube (no HTTP requests)
        let urlType;
        if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
            if (url.searchParams.has('list')) {
                urlType = 'yt_playlist';
            } else {
                urlType = 'yt_video';
            }
        } else {
            // Fall back to play-dl for other platforms (slower)
            urlType = await play.validate(source);
        }
        log.debug(`[TIMING] URL type detected: ${urlType} (${Date.now() - startTime}ms)`);

        if (!urlType || urlType === false) {
            throw new Error('Unsupported URL. Supported: YouTube, SoundCloud, Spotify');
        }

        // Handle YouTube playlists
        if (urlType === 'yt_playlist') {
            // Extract first video ID from URL to start immediately - don't wait for playlist fetch
            const firstVideoId = url.searchParams.get('v');
            if (firstVideoId) {
                const firstTrack = {
                    title: 'Loading playlist...',
                    url: `https://www.youtube.com/watch?v=${firstVideoId}`,
                    isLocal: false,
                };
                tracks.push(firstTrack);
                
                // Start fetching stream URL immediately (in background)
                getStreamUrl(firstTrack.url).catch(() => {});
                log.debug(`Queued first track, pre-fetching stream URL...`);
            }
            
            // Fetch full playlist in background
            youtubedl(source, {
                dumpSingleJson: true,
                flatPlaylist: true,
                noWarnings: true,
                quiet: true,
            }).then(playlistInfo => {
                const entries = playlistInfo.entries || [];
                const state = voiceStates.get(guildId);
                if (!state) return;
                
                let added = 0;
                for (const video of entries) {
                    const videoUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
                    
                    // Skip first video if we already queued it
                    if (firstVideoId && video.id === firstVideoId) {
                        // Update the placeholder track's title
                        const existingTrack = state.queue.find(t => t.url.includes(firstVideoId)) || 
                            (state.nowPlaying?.includes(firstVideoId) ? null : null);
                        if (tracks[0] && tracks[0].url.includes(firstVideoId)) {
                            tracks[0].title = video.title || 'Unknown Track';
                            tracks[0].duration = video.duration;
                        }
                        continue;
                    }
                    
                    state.queue.push({
                        title: video.title || 'Unknown Track',
                        url: videoUrl,
                        duration: video.duration,
                        isLocal: false,
                    });
                    added++;
                }
                log.info(`Added ${added} more tracks from playlist: ${playlistInfo.title}`);
            }).catch(e => {
                log.error(`Failed to fetch playlist: ${e.message}`);
            });
            
            // Return immediately with just the first track
            if (tracks.length === 0) {
                throw new Error('Could not extract first video from playlist URL');
            }
        }
        // Handle YouTube video (possibly with playlist param)
        else if (urlType === 'yt_video') {
            // Clean playlist parameter if present
            if (url.hostname.includes('youtube.com') && url.searchParams.has('list')) {
                source = `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
            }

            // Queue immediately - don't wait for metadata
            const track = {
                title: 'Loading...',
                url: source,
                isLocal: false,
            };
            tracks.push(track);
            
            // Start fetching stream URL immediately (in background)
            getStreamUrl(source).catch(() => {});
            
            // Fetch metadata async (don't block playback)
            youtubedl(source, {
                dumpSingleJson: true,
                noPlaylist: true,
                noWarnings: true,
                quiet: true,
            }).then(info => {
                track.title = info.title || 'Unknown Track';
                track.duration = info.duration;
            }).catch(e => {
                log.warn(`Could not fetch video info: ${e.message}`);
            });
        }
        // Handle SoundCloud
        else if (urlType === 'so_track' || urlType === 'so_playlist') {
            if (urlType === 'so_playlist') {
                const playlist = await play.soundcloud(source);
                const tracks_data = await playlist.all_tracks();
                for (const track of tracks_data) {
                    tracks.push({
                        title: track.name,
                        url: track.url,
                        duration: Math.floor(track.durationInMs / 1000),
                        isLocal: false,
                    });
                }
            } else {
                const track = await play.soundcloud(source);
                tracks.push({
                    title: track.name,
                    url: source,
                    duration: Math.floor(track.durationInMs / 1000),
                    isLocal: false,
                });
            }
        }
        // Other supported types
        else {
            tracks.push({
                title: source,
                url: source,
                isLocal: false,
            });
        }
    } else {
        // Play from stored sound file (local or S3)
        // Check if sound exists
        const exists = await storage.soundExists(source);
        if (!exists) {
            throw new Error(`Sound file not found: ${source}`);
        }

        // Get stream from storage
        const stream = await storage.getSoundStream(source);

        tracks.push({
            title: path.basename(source, path.extname(source)),
            source: stream,
            isLocal: true,
            isStream: true, // Indicate this is a stream, not a file path
        });
    }

    // Add tracks to queue
    state.queue.push(...tracks);
    log.debug(`[TIMING] Tracks queued (${Date.now() - startTime}ms)`);

    // Start playing if not already
    const isPlaying = state.player.state.status === AudioPlayerStatus.Playing;
    if (!isPlaying) {
        log.debug(`[TIMING] Calling playNext (${Date.now() - startTime}ms)`);
        await playNext(guildId);
        log.debug(`[TIMING] playNext returned (${Date.now() - startTime}ms)`);
    }
    log.info(`Added ${tracks.length} track(s) to queue`);

    return {
        added: tracks.length,
        tracks: tracks.slice(0, 5), // Return first 5 for display
        totalInQueue: state.queue.length,
    };
}

/**
 * Skip current track
 */
function skip(guildId) {
    const state = voiceStates.get(guildId);
    if (!state) {
        throw new Error('Bot is not connected to a voice channel');
    }

    const skipped = state.nowPlaying;
    state.player.stop(); // This triggers Idle event which plays next
    
    return skipped;
}

/**
 * Pause/resume playback
 */
function togglePause(guildId) {
    const state = voiceStates.get(guildId);
    if (!state) {
        throw new Error('Bot is not connected to a voice channel');
    }

    if (state.player.state.status === AudioPlayerStatus.Paused) {
        state.player.unpause();
        return { paused: false };
    } else if (state.player.state.status === AudioPlayerStatus.Playing) {
        state.player.pause();
        return { paused: true };
    } else {
        throw new Error('Nothing is playing');
    }
}

/**
 * Get the current queue
 */
function getQueue(guildId) {
    const state = voiceStates.get(guildId);
    if (!state) {
        return { nowPlaying: null, queue: [] };
    }

    return {
        nowPlaying: state.nowPlaying,
        queue: state.queue.slice(0, 20), // Return first 20
        totalInQueue: state.queue.length,
    };
}

/**
 * Clear the queue
 */
function clearQueue(guildId) {
    const state = voiceStates.get(guildId);
    if (!state) {
        throw new Error('Bot is not connected to a voice channel');
    }

    const cleared = state.queue.length;
    state.queue = [];
    log.info(`Cleared ${cleared} tracks from queue`);
    
    return cleared;
}

/**
 * Stop current playback and clear queue
 */
function stopSound(guildId) {
    const state = voiceStates.get(guildId);
    if (state && state.player) {
        state.queue = [];
        state.player.stop();
        state.nowPlaying = null;
        log.debug(`Stopped playback in guild ${guildId}`);
        return true;
    }
    return false;
}

/**
 * Get status for a guild
 */
function getStatus(guildId) {
    const state = voiceStates.get(guildId);
    if (!state) {
        return null;
    }

    return {
        channelId: state.channelId,
        channelName: state.channelName,
        nowPlaying: state.nowPlaying,
        isPlaying: state.player.state.status === AudioPlayerStatus.Playing,
        queueLength: state.queue.length,
    };
}

/**
 * Get all active voice connections
 */
function getAllConnections() {
    const connections = [];
    for (const [guildId, state] of voiceStates) {
        connections.push({
            guildId,
            channelId: state.channelId,
            channelName: state.channelName,
            nowPlaying: state.nowPlaying,
            isPlaying: state.player.state.status === AudioPlayerStatus.Playing,
            queueLength: state.queue.length,
        });
    }
    return connections;
}

/**
 * List all available sounds
 */
async function listSounds() {
    return await storage.listSounds();
}

/**
 * Delete a sound file
 */
async function deleteSound(filename) {
    return await storage.deleteSound(filename);
}

module.exports = {
    joinChannel,
    leaveChannel,
    playSound,
    skip,
    togglePause,
    getQueue,
    clearQueue,
    stopSound,
    getStatus,
    getAllConnections,
    listSounds,
    deleteSound,
    SOUNDS_DIR,
};
