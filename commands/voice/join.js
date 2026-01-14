const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ensureSession } = require('../../dist/utils/voice/voiceSessionManager');
const { checkVoicePermissions, createErrorResponse } = require('../utils/commandHelpers');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('JOIN');

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
      await ensureSession({ guildId: interaction.guildId, voiceChannel });
      await interaction.reply(`🔊 Joined **${voiceChannel.name}**! Use \`/play\` to start playing music.`);
      log.info(`Joined VC: ${voiceChannel.name} in guild ${interaction.guild.name}`);
    } catch (error) {
      log.error(`Failed to join VC: ${error.message}`);
      const reply = createErrorResponse(
        error,
        'Failed to join the voice channel',
        '💡 Make sure I have the necessary permissions and try again.'
      );
      // Check if already replied
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
