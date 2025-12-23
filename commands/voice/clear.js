const { SlashCommandBuilder } = require('discord.js');
const { executeClear, formatClearMessage } = require('./clear.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear the music queue while keeping the current track playing (use /stop to stop everything)'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const result = executeClear(guildId);

        if (!result.success) {
            return interaction.reply({
                content: result.error || 'An error occurred',
                ephemeral: true,
            });
        }

        const message = formatClearMessage(result.result);
        await interaction.reply(message);
    },
};

