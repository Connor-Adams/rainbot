const { SlashCommandBuilder } = require('discord.js');
const { executeStop } = require('./stop.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback immediately and clear the entire queue (use /clear to keep current track)'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const result = executeStop(guildId);

        if (!result.success) {
            return interaction.reply({
                content: result.error || 'An error occurred',
                ephemeral: true,
            });
        }

        await interaction.reply('⏹️ Stopped playback and cleared the queue.');
    },
};

