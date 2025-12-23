"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePlay = executePlay;
exports.executePlayDeferred = executePlayDeferred;
const playerEmbed_1 = require("../../utils/playerEmbed");
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');
const log = createLogger('PLAY');
async function executePlay(params) {
    const { guildId, source, userId } = params;
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            needsDefer: false,
            ephemeral: true,
            content: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
        };
    }
    // Need to defer for async operations
    return {
        needsDefer: true,
    };
}
async function executePlayDeferred(params) {
    const { guildId, source, userId } = params;
    log.info(`Request: "${source}" by ${userId || 'unknown'} in ${guildId}`);
    try {
        const result = await voiceManager.playSound(guildId, source, userId);
        const queueInfo = voiceManager.getQueue(guildId);
        const { nowPlaying, queue, currentTrack } = queueInfo;
        const status = voiceManager.getStatus(guildId);
        const isPaused = status ? !status.isPlaying : false;
        if (result.added === 1) {
            log.info(`Playing: "${result.tracks[0].title}"`);
            return {
                needsDefer: false,
                playerMessage: (0, playerEmbed_1.createPlayerMessage)(nowPlaying, queue, isPaused, currentTrack, queueInfo),
            };
        }
        else {
            log.info(`Added ${result.added} tracks to queue`);
            // Show playlist added message with player
            const playerMsg = (0, playerEmbed_1.createPlayerMessage)(nowPlaying, queue, isPaused, currentTrack, queueInfo);
            playerMsg.content = `📋 Added **${result.added}** track${result.added === 1 ? '' : 's'} to queue!`;
            return {
                needsDefer: false,
                playerMessage: playerMsg,
            };
        }
    }
    catch (error) {
        log.error(`Failed to play "${source}": ${error.message}`);
        return {
            needsDefer: false,
            content: `❌ Failed to play "${source}": ${error.message}\n\n💡 **Tips:**\n• Try searching with song name and artist (e.g., "Bohemian Rhapsody Queen")\n• Use direct URLs for YouTube, SoundCloud, or Spotify\n• For sound files, use the exact filename\n• For playlists, use the playlist URL`,
        };
    }
}
