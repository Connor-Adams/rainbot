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

      // Start listening to all users already in the channel if voice control is enabled
      try {
        const {
          getVoiceInteractionManager,
        } = require('../../dist/utils/voice/voiceInteractionInstance');
        const { getVoiceConnection } = require('@discordjs/voice');
        const voiceInteractionMgr = getVoiceInteractionManager();

        if (voiceInteractionMgr && voiceInteractionMgr.isEnabledForGuild(interaction.guildId)) {
          const connection = getVoiceConnection(interaction.guildId);
          if (connection) {
            // Get all members in the voice channel (excluding bots)
            const members = voiceChannel.members.filter((m) => !m.user.bot);
            for (const [userId, member] of members) {
              await voiceInteractionMgr.startListening(userId, interaction.guildId, connection);
              console.log(`Started voice listening for existing user: ${member.user.tag}`);
            }
          }
        }
      } catch (voiceError) {
        // Don't fail the join if voice interaction setup fails
        console.log(`Voice interaction setup failed (non-critical): ${voiceError.message}`);
      }

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
