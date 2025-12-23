"use strict";
// Note: join command needs Discord.js VoiceChannel object which can't be easily typed
// Most logic stays in JS, but we can provide helper functions if needed
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateJoinPermissions = validateJoinPermissions;
exports.formatJoinSuccessMessage = formatJoinSuccessMessage;
exports.formatJoinErrorMessage = formatJoinErrorMessage;
function validateJoinPermissions(hasConnect, hasSpeak, channelName) {
    const missingPerms = [];
    if (!hasConnect)
        missingPerms.push('Connect');
    if (!hasSpeak)
        missingPerms.push('Speak');
    if (missingPerms.length > 0) {
        return {
            valid: false,
            error: `❌ I need the following permissions in **${channelName}**: ${missingPerms.join(', ')}\n\n💡 Ask a server administrator to grant these permissions.`,
            missingPerms,
        };
    }
    return { valid: true };
}
function formatJoinSuccessMessage(channelName) {
    return `🔊 Joined **${channelName}**! Use \`/play\` to start playing music.`;
}
function formatJoinErrorMessage(error) {
    return `❌ Failed to join the voice channel: ${error.message}\n\n💡 Make sure I have the necessary permissions and try again.`;
}
