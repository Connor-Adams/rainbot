const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { validateJoinPermissions, formatJoinSuccessMessage, formatJoinErrorMessage } = require('./join.ts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your current voice channel (requires Connect and Speak permissions)'),

    async execute(interaction) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ You need to be in a voice channel first! Join a voice channel and try again.',
                ephemeral: true,
            });
        }

        // Check bot permissions
        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        const validation = validateJoinPermissions(
            permissions.has('Connect'),
            permissions.has('Speak'),
            voiceChannel.name
        );
        
        if (!validation.valid) {
            return interaction.reply({
                content: validation.error || 'Permission error',
                ephemeral: true,
            });
        }

        try {
            await voiceManager.joinChannel(voiceChannel);
            await interaction.reply(formatJoinSuccessMessage(voiceChannel.name));
        } catch (error) {
            console.error('Error joining voice channel:', error);
            await interaction.reply({
                content: formatJoinErrorMessage(error),
                ephemeral: true,
            });
        }
    },
};

