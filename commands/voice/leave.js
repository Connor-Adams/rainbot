const { SlashCommandBuilder } = require('discord.js');
const { executeLeave, formatLeaveMessage } = require('./leave.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Leave the current voice channel (playback and queue will stop)'),

    async execute(interaction) {
        const guildId = interaction.guildId;

        const result = executeLeave(guildId);

        if (!result.success) {
            return interaction.reply({
                content: result.error || 'An error occurred',
                ephemeral: true,
            });
        }

        const message = formatLeaveMessage(result.channelName);
        await interaction.reply(message);
    },
};

