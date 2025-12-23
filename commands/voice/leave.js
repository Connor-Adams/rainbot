"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeLeave = executeLeave;
exports.formatLeaveMessage = formatLeaveMessage;
const voiceManager = require('../../utils/voiceManager');
function executeLeave(guildId) {
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            success: false,
            error: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
        };
    }
    try {
        const channelName = status.channelName;
        voiceManager.leaveChannel(guildId);
        return {
            success: true,
            channelName: channelName || undefined,
        };
    }
    catch (error) {
        return {
            success: false,
            error: `❌ Failed to leave the voice channel: ${error.message}`,
        };
    }
}
function formatLeaveMessage(channelName) {
    if (channelName) {
        return `👋 Left **${channelName}**! The queue has been cleared.`;
    }
    return '👋 Left the voice channel! The queue has been cleared.';
}
