const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Create a now playing embed with control buttons
 */
function createPlayerEmbed(nowPlaying, queue, isPaused = false) {
    const embed = new EmbedBuilder()
        .setColor(isPaused ? 0xf59e0b : 0x6366f1)
        .setTitle(isPaused ? '⏸️ Paused' : '🎵 Now Playing')
        .setDescription(`**${nowPlaying || 'Nothing playing'}**`)
        .setTimestamp();

    if (queue.length > 0) {
        const upNext = queue.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
        const moreText = queue.length > 3 ? `\n*+${queue.length - 3} more...*` : '';
        embed.addFields({
            name: `📋 Up Next (${queue.length})`,
            value: upNext + moreText,
            inline: false,
        });
    }

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
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('player_skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasQueue),
            new ButtonBuilder()
                .setCustomId('player_stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('player_queue')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary),
        );

    return row;
}

/**
 * Create full player message components
 */
function createPlayerMessage(nowPlaying, queue, isPaused = false) {
    return {
        embeds: [createPlayerEmbed(nowPlaying, queue, isPaused)],
        components: [createControlButtons(isPaused, queue.length > 0)],
    };
}

module.exports = {
    createPlayerEmbed,
    createControlButtons,
    createPlayerMessage,
};

