const { SlashCommandBuilder } = require('discord.js');
const { executeNP } = require('./np.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('np')
        .setDescription('Show the now playing card with playback controls and queue info'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const result = executeNP(guildId);

        if (!result.success) {
            return interaction.reply({
                content: result.error || 'An error occurred',
                ephemeral: true,
            });
        }

        await interaction.reply(result.playerMessage!);
    },
};

