const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return null;
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
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
        return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
    }
    return null;
}

/**
 * Create a now playing embed with control buttons
 */
function createPlayerEmbed(nowPlaying, queue, isPaused = false, currentTrack = null) {
    const embed = new EmbedBuilder()
        .setColor(isPaused ? 0xf59e0b : 0x6366f1)
        .setTitle(isPaused ? '⏸️ Paused' : '🎵 Now Playing')
        .setTimestamp();

    // Get current track info if available
    let trackTitle = nowPlaying || 'Nothing playing';
    let trackDuration = null;
    let trackUrl = null;
    
    if (currentTrack) {
        trackTitle = currentTrack.title || trackTitle;
        trackDuration = currentTrack.duration;
        trackUrl = currentTrack.url;
    } else if (queue.length > 0 && queue[0]) {
        // Try to get info from first queue item if it matches
        trackUrl = queue[0].url;
    }

    // Set thumbnail if YouTube URL
    const thumbnail = getYouTubeThumbnail(trackUrl);
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }

    // Format duration
    const durationText = trackDuration ? ` • ${formatDuration(trackDuration)}` : '';
    
    embed.setDescription(`**${trackTitle}**${durationText}`);

    // Add queue preview
    if (queue.length > 0) {
        const upNext = queue.slice(0, 5).map((t, i) => {
            const num = (i + 1).toString().padStart(2, '0');
            const duration = t.duration ? ` \`${formatDuration(t.duration)}\`` : '';
            return `\`${num}\` ${t.title}${duration}`;
        }).join('\n');
        
        const moreText = queue.length > 5 ? `\n*...and ${queue.length - 5} more*` : '';
        
        embed.addFields({
            name: `📋 Queue — ${queue.length} track${queue.length === 1 ? '' : 's'}`,
            value: upNext + moreText,
            inline: false,
        });
    } else {
        embed.addFields({
            name: '📋 Queue',
            value: '*Queue is empty*',
            inline: false,
        });
    }

    // Add footer with status
    const statusEmoji = isPaused ? '⏸️' : '▶️';
    embed.setFooter({ 
        text: `${statusEmoji} ${isPaused ? 'Paused' : 'Playing'} • Use /play to add more tracks`
    });

    return embed;
}

/**
 * Create control buttons row
 */
function createControlButtons(isPaused = false, hasQueue = false) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('player_pause')
                .setLabel(isPaused ? 'Resume' : 'Pause')
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_skip')
                .setLabel('Skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasQueue),
            new ButtonBuilder()
                .setCustomId('player_stop')
                .setLabel('Stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('player_queue')
                .setLabel('View Queue')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary),
        );

    return row;
}

/**
 * Create full player message components
 */
function createPlayerMessage(nowPlaying, queue, isPaused = false, currentTrack = null) {
    return {
        embeds: [createPlayerEmbed(nowPlaying, queue, isPaused, currentTrack)],
        components: [createControlButtons(isPaused, queue.length > 0)],
    };
}

module.exports = {
    createPlayerEmbed,
    createControlButtons,
    createPlayerMessage,
    formatDuration,
};

