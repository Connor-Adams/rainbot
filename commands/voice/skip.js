const { SlashCommandBuilder } = require('discord.js');
const { executeSkip, formatSkipMessage } = require('./skip.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track or multiple tracks from the queue')
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('Number of tracks to skip (default: 1)')
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const count = interaction.options.getInteger('count') || 1;

        const result = executeSkip({ guildId, count });

        if (!result.success) {
            return interaction.reply({
                content: result.error || 'An error occurred',
                ephemeral: true,
            });
        }

        const message = formatSkipMessage(result.result!);
        await interaction.reply(message);
    },
};

