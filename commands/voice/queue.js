const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current music queue'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const status = voiceManager.getStatus(guildId);
        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel!',
                ephemeral: true,
            });
        }

        const { nowPlaying, queue, totalInQueue } = voiceManager.getQueue(guildId);

        const embed = new EmbedBuilder()
            .setTitle('🎵 Music Queue')
            .setColor(0x6366f1);

        if (nowPlaying) {
            embed.addFields({
                name: '▶️ Now Playing',
                value: `**${nowPlaying}**`,
                inline: false,
            });
        } else {
            embed.addFields({
                name: '▶️ Now Playing',
                value: '*Nothing playing*',
                inline: false,
            });
        }

        if (queue.length > 0) {
            const queueList = queue
                .map((track, i) => `${i + 1}. ${track.title}`)
                .join('\n');
            
            const moreText = totalInQueue > 20 ? `\n\n*... and ${totalInQueue - 20} more*` : '';
            
            embed.addFields({
                name: `📋 Up Next (${totalInQueue} tracks)`,
                value: queueList + moreText,
                inline: false,
            });
        } else {
            embed.addFields({
                name: '📋 Up Next',
                value: '*Queue is empty*',
                inline: false,
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};

