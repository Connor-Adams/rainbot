const { SlashCommandBuilder } = require('discord.js');
const { executePause, formatPauseMessage } = require('./pause.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Toggle pause/resume playback (pauses if playing, resumes if paused)'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const result = executePause(guildId);

        if (!result.success) {
            return interaction.reply({
                content: result.error || 'An error occurred',
                ephemeral: true,
            });
        }

        const message = formatPauseMessage(result.result!);
        await interaction.reply(message);
    },
};

