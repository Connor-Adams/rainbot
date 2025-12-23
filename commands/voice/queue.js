"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeQueue = executeQueue;
exports.createQueueEmbed = createQueueEmbed;
const discord_js_1 = require("discord.js");
const playerEmbed_1 = require("../../utils/playerEmbed");
const voiceManager = require('../../utils/voiceManager');
function getYouTubeThumbnail(url) {
    if (!url)
        return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
        return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
    }
    return null;
}
function executeQueue(guildId) {
    const status = voiceManager.getStatus(guildId);
    if (!status) {
        return {
            queueInfo: {
                nowPlaying: null,
                queue: [],
                totalInQueue: 0,
                currentTrack: null,
                playbackPosition: 0,
                hasOverlay: false,
                isPaused: false,
                channelName: null,
            },
            status: null,
        };
    }
    const queueInfo = voiceManager.getQueue(guildId);
    return { queueInfo, status };
}
function createQueueEmbed(result) {
    const { queueInfo, status } = result;
    const { nowPlaying, queue, totalInQueue, currentTrack, playbackPosition, hasOverlay, isPaused, channelName } = queueInfo;
    // Determine embed color based on state
    let embedColor = 0x6366f1; // Default blue
    if (hasOverlay) {
        embedColor = 0x8b5cf6; // Purple when overlay active
    }
    else if (isPaused) {
        embedColor = 0xf59e0b; // Orange when paused
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('🎵 Music Queue')
        .setColor(embedColor)
        .setTimestamp();
    // Now Playing section with playback position
    if (nowPlaying && currentTrack) {
        let description = `**${nowPlaying}**`;
        // Show playback progress if available
        if (currentTrack.duration && playbackPosition > 0) {
            const currentTime = (0, playerEmbed_1.formatDuration)(playbackPosition);
            const totalTime = (0, playerEmbed_1.formatDuration)(currentTrack.duration);
            description += `\n\`${currentTime} / ${totalTime}\``;
        }
        else if (currentTrack.duration) {
            description += ` • \`${(0, playerEmbed_1.formatDuration)(currentTrack.duration)}\``;
        }
        // Add state indicators
        if (hasOverlay) {
            description += '\n\n🔊 *Soundboard overlay active*';
        }
        else if (isPaused) {
            description += '\n\n⏸️ *Paused*';
        }
        const thumbnail = getYouTubeThumbnail(currentTrack.url);
        if (thumbnail && !currentTrack.isSoundboard) {
            embed.setThumbnail(thumbnail);
        }
        embed.setDescription(description);
    }
    else if (nowPlaying) {
        embed.setDescription(`**${nowPlaying}**`);
    }
    else {
        embed.setDescription('*Nothing playing*');
    }
    // Queue section
    if (queue.length > 0) {
        const queueList = queue
            .map((track, i) => {
            const num = (i + 1).toString().padStart(2, '0');
            const duration = track.duration ? ` \`${(0, playerEmbed_1.formatDuration)(track.duration)}\`` : '';
            return `\`${num}\` ${track.title}${duration}`;
        })
            .join('\n');
        const moreText = totalInQueue > 20 ? `\n\n*...and ${totalInQueue - 20} more track${totalInQueue - 20 === 1 ? '' : 's'}*` : '';
        embed.addFields({
            name: `📋 Up Next — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}`,
            value: queueList + moreText,
            inline: false,
        });
    }
    else {
        embed.addFields({
            name: '📋 Queue',
            value: '*Queue is empty*\n\nUse `/play` to add tracks!',
            inline: false,
        });
    }
    // Build footer with state info
    let footerText = `Total: ${totalInQueue} track${totalInQueue === 1 ? '' : 's'} in queue`;
    if (channelName) {
        footerText += ` • ${channelName}`;
    }
    if (hasOverlay) {
        footerText += ' • 🔊 Overlay Active';
    }
    else if (isPaused) {
        footerText += ' • ⏸️ Paused';
    }
    embed.setFooter({ text: footerText });
    return embed;
}
