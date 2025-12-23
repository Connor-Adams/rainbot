"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeClear = executeClear;
exports.formatClearMessage = formatClearMessage;
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');
const log = createLogger('CLEAR');
function executeClear(guildId) {
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            success: false,
            error: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
        };
    }
    try {
        const cleared = voiceManager.clearQueue(guildId);
        const { nowPlaying } = voiceManager.getQueue(guildId);
        log.info(`Cleared ${cleared} tracks`);
        return {
            success: true,
            result: {
                cleared,
                nowPlaying: nowPlaying || null,
            },
        };
    }
    catch (error) {
        log.error(`Clear error: ${error.message}`);
        return {
            success: false,
            error: `❌ ${error.message}`,
        };
    }
}
function formatClearMessage(result) {
    const currentTrack = result.nowPlaying ? `\n\n▶️ Still playing: **${result.nowPlaying}**` : '';
    if (result.cleared === 0) {
        return `📋 Queue was already empty.${currentTrack}`;
    }
    else {
        return `🗑️ Cleared **${result.cleared}** track${result.cleared === 1 ? '' : 's'} from the queue.${currentTrack}`;
    }
}
