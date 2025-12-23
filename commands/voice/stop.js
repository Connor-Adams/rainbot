"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeStop = executeStop;
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');
const log = createLogger('STOP');
function executeStop(guildId) {
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            success: false,
            error: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
        };
    }
    try {
        const stopped = voiceManager.stopSound(guildId);
        if (stopped) {
            log.info('Stopped');
            return {
                success: true,
            };
        }
        else {
            return {
                success: false,
                error: '❌ Nothing is playing. Use `/play` to start playback.',
            };
        }
    }
    catch (error) {
        log.error(`Stop error: ${error.message}`);
        return {
            success: false,
            error: `❌ ${error.message}`,
        };
    }
}
