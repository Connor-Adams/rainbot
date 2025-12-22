const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');

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
        const missingPerms = [];
        if (!permissions.has('Connect')) missingPerms.push('Connect');
        if (!permissions.has('Speak')) missingPerms.push('Speak');
        
        if (missingPerms.length > 0) {
            return interaction.reply({
                content: `❌ I need the following permissions in **${voiceChannel.name}**: ${missingPerms.join(', ')}\n\n💡 Ask a server administrator to grant these permissions.`,
                ephemeral: true,
            });
        }

        try {
            await voiceManager.joinChannel(voiceChannel);
            await interaction.reply(`🔊 Joined **${voiceChannel.name}**! Use \`/play\` to start playing music.`);
        } catch (error) {
            console.error('Error joining voice channel:', error);
            await interaction.reply({
                content: `❌ Failed to join the voice channel: ${error.message}\n\n💡 Make sure I have the necessary permissions and try again.`,
                ephemeral: true,
            });
        }
    },
};

