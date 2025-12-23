const { SlashCommandBuilder } = require('discord.js');
const { executeQueue, createQueueEmbed } = require('./queue.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current music queue and what\'s playing now'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const result = executeQueue(guildId);
        
        if (!result.status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel! Use `/join` to connect me to your voice channel first.',
                ephemeral: true,
            });
        }

        const embed = createQueueEmbed(result);
        await interaction.reply({ embeds: [embed] });
    },
};

