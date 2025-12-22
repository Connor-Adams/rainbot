const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your current voice channel'),

    async execute(interaction) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ You need to be in a voice channel first!',
                ephemeral: true,
            });
        }

        // Check bot permissions
        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({
                content: '❌ I need permissions to join and speak in that channel!',
                ephemeral: true,
            });
        }

        try {
            await voiceManager.joinChannel(voiceChannel);
            await interaction.reply(`🔊 Joined **${voiceChannel.name}**!`);
        } catch (error) {
            console.error('Error joining voice channel:', error);
            await interaction.reply({
                content: '❌ Failed to join the voice channel.',
                ephemeral: true,
            });
        }
    },
};

