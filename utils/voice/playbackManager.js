const { AudioPlayerStatus } = require('@discordjs/voice');
const { createLogger } = require('../logger');
const { createTrackResourceForAny, createResourceWithSeek, getStreamUrl } = require('./audioResource');
const { getNextTrack } = require('./queueManager');
const storage = require('../storage');
const stats = require('../statistics');
const listeningHistory = require('../listeningHistory');
const { detectSourceType } = require('../sourceType');

const log = createLogger('PLAYBACK_MANAGER');

/**
 * Helper to play a resource with volume applied
 */
function playWithVolume(state, resource) {
    // Apply current volume
    if (resource.volume) {
        resource.volume.setVolume((state.volume || 100) / 100);
    }
    state.currentResource = resource;
    state.player.play(resource);
}

/**
 * Pre-buffer the next track in the queue
 */
function preBufferNext(guildId, voiceStates) {
    const state = voiceStates.get(guildId);
    if (!state || state.queue.length === 0) return;
    
    const nextTrack = state.queue[0];
    if (!nextTrack || nextTrack.isLocal) return;
    
    // Only pre-buffer YouTube tracks
    const ytMatch = nextTrack.url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!ytMatch) return;
    
    log.debug(`Pre-buffering: ${nextTrack.title}`);
    const { createTrackResource } = require('./audioResource');
    const buffered = createTrackResource(nextTrack);
    if (buffered) {
        state.preBuffered = { track: nextTrack, ...buffered };
    }
}

/**
 * Play the next track in the queue
 */
async function playNext(guildId, voiceStates) {
    const playStartTime = Date.now();
    const state = voiceStates.get(guildId);
    if (!state || state.queue.length === 0) {
        if (state) {
            state.nowPlaying = null;
            state.currentTrack = null;
            state.preBuffered = null;
        }
        return null;
    }

    const nextTrack = getNextTrack(state);
    if (!nextTrack) return null;
    
    log.debug(`[TIMING] playNext: starting ${nextTrack.title}`);
    
    // Get userId from track (if stored) or fall back to lastUserId
    const trackUserId = nextTrack.userId || state.lastUserId;
    const trackUsername = nextTrack.username || state.lastUsername;
    const trackDiscriminator = nextTrack.discriminator || state.lastDiscriminator;
    
    try {
        let resource;

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
            
            log.debug(`Streaming: ${nextTrack.url || nextTrack.title}`);
            const result = await createTrackResourceForAny(nextTrack);
            resource = result.resource;
        }

        log.debug(`[TIMING] playNext: resource created (${Date.now() - playStartTime}ms)`);
        playWithVolume(state, resource);
        state.nowPlaying = nextTrack.title;
        state.currentTrack = nextTrack;
        state.currentTrackSource = nextTrack.isLocal ? null : nextTrack.url;
        state.playbackStartTime = Date.now();
        log.debug(`[TIMING] playNext: player.play() called (${Date.now() - playStartTime}ms)`);
        log.info(`Now playing: ${nextTrack.title}`);
        
        // Track sound playback statistics
        if (trackUserId) {
            const sourceType = detectSourceType(nextTrack);
            const source = nextTrack.source || 'discord';
            
            stats.trackSound(
                nextTrack.title,
                trackUserId,
                guildId,
                sourceType,
                false,
                nextTrack.duration || null,
                source,
                trackUsername,
                trackDiscriminator
            );
            
            listeningHistory.trackPlayed(trackUserId, guildId, {
                title: nextTrack.title,
                url: nextTrack.url,
                duration: nextTrack.duration,
                isLocal: nextTrack.isLocal,
                sourceType,
                source,
                spotifyId: nextTrack.spotifyId,
                spotifyUrl: nextTrack.spotifyUrl,
            }, nextTrack.userId || null).catch(err => log.error(`Failed to track listening history: ${err.message}`));
        }
        
        // Pre-buffer the next track for instant skip
        setTimeout(() => preBufferNext(guildId, voiceStates), 500);
        
        return nextTrack;
    } catch (error) {
        log.error(`Failed to play ${nextTrack.title}: ${error.message}`);
        
        // Check if it's a recoverable error
        const isRecoverable = error.message.includes('403') || 
                              error.message.includes('404') || 
                              error.message.includes('unavailable') ||
                              error.message.includes('deleted') ||
                              error.message.includes('terminated') ||
                              error.message.includes('Stream fetch failed') ||
                              error.message.includes('no longer available');
        
        if (isRecoverable) {
            log.warn(`Skipping track due to error: ${nextTrack.title}`);
        }
        
        // Try to play next track automatically
        if (state.queue.length > 0) {
            log.info(`Auto-advancing to next track in queue...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return playNext(guildId, voiceStates);
        } else {
            state.nowPlaying = null;
            state.currentTrack = null;
            log.info(`Queue exhausted after error`);
            return null;
        }
    }
}

/**
 * Play a track with seek position
 * @param {Object} state - Voice state object
 * @param {Object} track - Track object
 * @param {number} seekSeconds - Position to seek to in seconds
 * @param {boolean} startPaused - Whether to start in paused state
 */
async function playWithSeek(state, track, seekSeconds, startPaused = false) {
    const result = await createResourceWithSeek(track, seekSeconds);
    const resource = result.resource;
    const actualSeek = result.actualSeek !== undefined ? result.actualSeek : seekSeconds;

    state.currentTrack = track;
    state.nowPlaying = track.title;
    state.playbackStartTime = Date.now() - (actualSeek * 1000);
    state.totalPausedTime = 0;
    state.pauseStartTime = null;

    playWithVolume(state, resource);

    if (startPaused) {
        state.player.pause();
        state.pauseStartTime = Date.now();
    }

    log.info(`Resumed playback of "${track.title}" at ${actualSeek}s${startPaused ? ' (paused)' : ''}`);
}

/**
 * Toggle pause/resume playback
 */
function togglePause(state) {
    // Don't pause/resume if overlay is active
    if (state.overlayProcess) {
        log.debug('Overlay active, ignoring pause/resume');
        return { paused: state.player.state.status === AudioPlayerStatus.Paused };
    }
    
    if (state.player.state.status === AudioPlayerStatus.Paused) {
        state.player.unpause();
        
        // Track pause duration
        if (state.pauseStartTime) {
            const pauseDuration = Date.now() - state.pauseStartTime;
            state.totalPausedTime = (state.totalPausedTime || 0) + pauseDuration;
            state.pauseStartTime = null;
        }
        
        // Track resume operation
        if (state.lastUserId) {
            stats.trackQueueOperation('resume', state.lastUserId, state.channelId, 'discord');
        }
        
        return { paused: false };
    } else if (state.player.state.status === AudioPlayerStatus.Playing) {
        state.player.pause();
        state.pauseStartTime = Date.now();
        
        // Track pause operation
        if (state.lastUserId) {
            stats.trackQueueOperation('pause', state.lastUserId, state.channelId, 'discord');
        }
        
        return { paused: true };
    } else {
        throw new Error('Nothing is playing');
    }
}

/**
 * Set volume for a guild (1-100)
 */
function setVolume(state, level) {
    // Clamp volume between 1 and 100
    const volume = Math.max(1, Math.min(100, level));
    state.volume = volume;

    // Apply to current resource if it has inline volume
    if (state.currentResource && state.currentResource.volume) {
        state.currentResource.volume.setVolume(volume / 100);
    }

    return volume;
}

/**
 * Stop current playback
 */
function stopPlayback(state) {
    state.queue = [];
    state.player.stop();
    state.nowPlaying = null;
    state.currentTrack = null;
    return true;
}

module.exports = {
    playWithVolume,
    preBufferNext,
    playNext,
    playWithSeek,
    togglePause,
    setVolume,
    stopPlayback,
};
