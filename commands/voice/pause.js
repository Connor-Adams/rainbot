"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executePause = executePause;
exports.formatPauseMessage = formatPauseMessage;
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');
const log = createLogger('PAUSE');
function executePause(guildId) {
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            success: false,
            error: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
        };
    }
    try {
        const result = voiceManager.togglePause(guildId);
        const { nowPlaying } = voiceManager.getQueue(guildId);
        if (result.paused) {
            log.info('Paused');
        }
        else {
            log.info('Resumed');
        }
        return {
            success: true,
            result: {
                paused: result.paused,
                nowPlaying: nowPlaying || null,
            },
        };
    }
    catch (error) {
        log.error(`Pause error: ${error.message}`);
        return {
            success: false,
            error: `❌ ${error.message}\n\n💡 **Tip:** Make sure something is playing before trying to pause.`,
        };
    }
}
function formatPauseMessage(result) {
    const trackInfo = result.nowPlaying ? ` **${result.nowPlaying}**` : '';
    if (result.paused) {
        return `⏸️ Paused playback${trackInfo}.`;
    }
    else {
        return `▶️ Resumed playback${trackInfo}.`;
    }
}
