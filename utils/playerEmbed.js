"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDuration = formatDuration;
exports.getYouTubeThumbnail = getYouTubeThumbnail;
exports.createPlayerEmbed = createPlayerEmbed;
exports.createControlButtons = createControlButtons;
exports.createPlayerMessage = createPlayerMessage;
const discord_js_1 = require("discord.js");
/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds))
        return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
/**
 * Extract YouTube video ID from URL
 */
function getYouTubeThumbnail(url) {
    if (!url)
        return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
        return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
    }
    return null;
}
/**
 * Create a now playing embed with control buttons
 */
function createPlayerEmbed(nowPlaying, queue, isPaused = false, currentTrack = null, queueInfo = {}) {
    const { playbackPosition = 0, hasOverlay = false, totalInQueue = queue.length, channelName = null, } = queueInfo;
    // Determine embed color based on state
    let embedColor = 0x6366f1; // Default blue
    if (hasOverlay) {
        embedColor = 0x8b5cf6; // Purple when overlay active
    }
    else if (isPaused) {
        embedColor = 0xf59e0b; // Orange when paused
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(embedColor)
        .setTimestamp();
    // Get current track info if available
    let trackTitle = nowPlaying || 'Nothing playing';
    let trackDuration = null;
    let trackUrl = null;
    let isSoundboard = false;
    if (currentTrack) {
        trackTitle = currentTrack.title || trackTitle;
        trackDuration = currentTrack.duration ?? null;
        trackUrl = currentTrack.url;
        isSoundboard = currentTrack.isSoundboard || trackTitle.startsWith('🔊');
    }
    else if (queue.length > 0 && queue[0]) {
        // Try to get info from first queue item if it matches
        trackUrl = queue[0].url;
    }
    // Set title based on state
    let title = '🎵 Now Playing';
    if (hasOverlay) {
        title = '🔊 Soundboard Overlay Active';
    }
    else if (isPaused) {
        title = '⏸️ Paused';
    }
    else if (isSoundboard) {
        title = '🔊 Soundboard';
    }
    embed.setTitle(title);
    // Set thumbnail if YouTube URL
    const thumbnail = getYouTubeThumbnail(trackUrl);
    if (thumbnail && !isSoundboard) {
        embed.setThumbnail(thumbnail);
    }
    // Build description with position and duration
    let description = `**${trackTitle}**`;
    if (trackDuration && playbackPosition > 0) {
        // Show progress: current / total
        const currentTime = formatDuration(playbackPosition);
        const totalTime = formatDuration(trackDuration);
        description += `\n\`${currentTime} / ${totalTime}\``;
    }
    else if (trackDuration) {
        description += ` • \`${formatDuration(trackDuration)}\``;
    }
    // Add overlay indicator
    if (hasOverlay) {
        description += '\n\n🔊 *Soundboard overlay active*';
    }
    embed.setDescription(description);
    // Add queue preview
    if (queue.length > 0) {
        const upNext = queue.slice(0, 5).map((t, i) => {
            const num = (i + 1).toString().padStart(2, '0');
            const duration = t.duration ? ` \`${formatDuration(t.duration)}\`` : '';
            const source = t.isLocal ? '🔊' : '';
            return `\`${num}\` ${source}${t.title}${duration}`;
        }).join('\n');
        const moreText = totalInQueue > 5 ? `\n*...and ${totalInQueue - 5} more*` : '';
        embed.addFields({
            name: `📋 Queue — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}`,
            value: upNext + moreText,
            inline: false,
        });
    }
    else {
        embed.addFields({
            name: '📋 Queue',
            value: '*Queue is empty*',
            inline: false,
        });
    }
    // Add footer with status and channel info
    const statusEmoji = hasOverlay ? '🔊' : (isPaused ? '⏸️' : '▶️');
    let footerText = `${statusEmoji} ${hasOverlay ? 'Overlay Active' : (isPaused ? 'Paused' : 'Playing')}`;
    if (channelName) {
        footerText += ` • ${channelName}`;
    }
    footerText += ' • Use /play to add tracks';
    embed.setFooter({ text: footerText });
    return embed;
}
/**
 * Create control buttons row
 */
function createControlButtons(isPaused = false, hasQueue = false) {
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('player_pause')
        .setLabel(isPaused ? 'Resume' : 'Pause')
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setStyle(isPaused ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId('player_skip')
        .setLabel('Skip')
        .setEmoji('⏭️')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(!hasQueue), new discord_js_1.ButtonBuilder()
        .setCustomId('player_stop')
        .setLabel('Stop')
        .setEmoji('⏹️')
        .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
        .setCustomId('player_queue')
        .setLabel('View Queue')
        .setEmoji('📋')
        .setStyle(discord_js_1.ButtonStyle.Secondary));
    return row;
}
/**
 * Create full player message components
 */
function createPlayerMessage(nowPlaying, queue, isPaused = false, currentTrack = null, queueInfo = {}) {
    const hasQueue = (queueInfo.totalInQueue ?? queue.length) > 0;
    return {
        embeds: [createPlayerEmbed(nowPlaying, queue, isPaused, currentTrack, queueInfo)],
        components: [createControlButtons(isPaused, hasQueue)],
    };
}
