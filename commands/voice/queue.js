const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current music queue and what\'s playing now'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
                ephemeral: true,
            });
        }

        const { nowPlaying, queue, totalInQueue, currentTrack } = voiceManager.getQueue(guildId);

        const embed = new EmbedBuilder()
            .setTitle('🎵 Music Queue')
            .setColor(0x6366f1)
            .setTimestamp();

        // Format duration helper
        const formatDuration = (seconds) => {
            if (!seconds || isNaN(seconds)) return null;
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };

        // Get YouTube thumbnail if available
        const getYouTubeThumbnail = (url) => {
            if (!url) return null;
            const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (match) {
                return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
            }
            return null;
        };

        // Now Playing section
        if (nowPlaying && currentTrack) {
            const durationText = currentTrack.duration ? ` • \`${formatDuration(currentTrack.duration)}\`` : '';
            const thumbnail = getYouTubeThumbnail(currentTrack.url);
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            embed.setDescription(`**${nowPlaying}**${durationText}`);
        } else if (nowPlaying) {
            embed.setDescription(`**${nowPlaying}**`);
        } else {
            embed.setDescription('*Nothing playing*');
        }

        // Queue section
        if (queue.length > 0) {
            const queueList = queue
                .map((track, i) => {
                    const num = (i + 1).toString().padStart(2, '0');
                    const duration = track.duration ? ` \`${formatDuration(track.duration)}\`` : '';
                    return `\`${num}\` ${track.title}${duration}`;
                })
                .join('\n');
            
            const moreText = totalInQueue > 20 ? `\n\n*...and ${totalInQueue - 20} more track${totalInQueue - 20 === 1 ? '' : 's'}*` : '';
            
            embed.addFields({
                name: `📋 Up Next — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}`,
                value: queueList + moreText,
                inline: false,
            });
        } else {
            embed.addFields({
                name: '📋 Queue',
                value: '*Queue is empty*\n\nUse `/play` to add tracks!',
                inline: false,
            });
        }

        embed.setFooter({ 
            text: `Total: ${totalInQueue} track${totalInQueue === 1 ? '' : 's'} in queue`
        });

        await interaction.reply({ embeds: [embed] });
    },
};

