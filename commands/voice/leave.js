const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Leave the current voice channel'),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const status = voiceManager.getStatus(guildId);

        if (!status) {
            return interaction.reply({
                content: '❌ I\'m not in a voice channel!',
                ephemeral: true,
            });
        }

        const channelName = status.channelName;
        voiceManager.leaveChannel(guildId);

        await interaction.reply(`👋 Left **${channelName}**!`);
    },
};

