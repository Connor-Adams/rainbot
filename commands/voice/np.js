"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeNP = executeNP;
const playerEmbed_1 = require("../../utils/playerEmbed");
const voiceManager = require('../../utils/voiceManager');
function executeNP(guildId) {
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            success: false,
            error: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
        };
    }
    if (!status.nowPlaying) {
        return {
            success: false,
            error: '❌ Nothing is playing right now. Use `/play` to start playing music.',
        };
    }
    const queueInfo = voiceManager.getQueue(guildId);
    const { nowPlaying, queue, currentTrack } = queueInfo;
    const isPaused = !status.isPlaying;
    return {
        success: true,
        playerMessage: (0, playerEmbed_1.createPlayerMessage)(nowPlaying, queue, isPaused, currentTrack, queueInfo),
    };
}
