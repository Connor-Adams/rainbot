"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeSkip = executeSkip;
exports.formatSkipMessage = formatSkipMessage;
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');
const log = createLogger('SKIP');
function executeSkip(params) {
    const { guildId, count } = params;
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            success: false,
            error: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
        };
    }
    try {
        const skipped = voiceManager.skip(guildId, count);
        if (skipped.length === 0) {
            return {
                success: false,
                error: '❌ Nothing is playing right now.',
            };
        }
        log.info(`Skipped ${skipped.length} track(s)`);
        const queue = voiceManager.getQueue(guildId);
        const nextUp = queue.queue[0]?.title || 'Nothing';
        return {
            success: true,
            result: {
                skipped,
                nextUp,
            },
        };
    }
    catch (error) {
        log.error(`Skip error: ${error.message}`);
        return {
            success: false,
            error: `❌ ${error.message}`,
        };
    }
}
function formatSkipMessage(result) {
    let replyText = '';
    if (result.skipped.length === 1) {
        replyText = `⏭️ Skipped: **${result.skipped[0]}**`;
    }
    else {
        replyText = `⏭️ Skipped **${result.skipped.length}** tracks:\n${result.skipped.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
    }
    replyText += `\n\n▶️ Up next: **${result.nextUp}**`;
    return replyText;
}
