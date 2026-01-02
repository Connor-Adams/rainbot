const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { checkVoicePermissions, createErrorResponse } = require('../utils/commandHelpers');

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
        flags: MessageFlags.Ephemeral,
      });
    }

    const permissionCheck = checkVoicePermissions(voiceChannel, interaction.client.user);
    if (!permissionCheck.hasPermissions) {
      return interaction.reply(permissionCheck.error);
    }

    try {
      await voiceManager.joinChannel(voiceChannel);
      await interaction.reply(
        `🔊 Joined **${voiceChannel.name}**! Use \`/play\` to start playing music.`
      );
    } catch (error) {
      console.error('Error joining voice channel:', error);
      // Check if we already replied
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(
          createErrorResponse(
            error,
            'Failed to join the voice channel',
            '💡 Make sure I have the necessary permissions and try again.'
          )
        );
      } else {
        await interaction.reply(
          createErrorResponse(
            error,
            'Failed to join the voice channel',
            '💡 Make sure I have the necessary permissions and try again.'
          )
        );
      }
    }
  },
};
