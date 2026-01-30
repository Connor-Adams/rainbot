/**
 * Join command - Multi-bot architecture version
 * Connects all worker bots to the voice channel
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const {
  checkVoicePermissions,
  createErrorResponse,
  getMultiBotService,
} = require('../utils/commandHelpers');
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
      const service = await getMultiBotService();
      if (service) {
        // Multi-bot architecture - connect all workers
        await interaction.deferReply();

        const result = await service.joinChannel(voiceChannel, interaction.user.id);

        if (!result.success) {
          return interaction.editReply({
            content: `❌ ${result.message || 'Failed to join voice channel'}`,
          });
        }

        log.info(`Joined ${voiceChannel.name} in ${interaction.guild.name} (multi-bot mode)`);
        await interaction.editReply(
          `ðŸ”Š Joined **${voiceChannel.name}**! Use \`/play\` to start playing music.`
        );
        return;
      }

      // Workers unavailable; allow orchestrator to join only.
      const voiceManager = require('../../dist/utils/voiceManager');
      await voiceManager.joinChannel(voiceChannel);
      log.info(`Joined ${voiceChannel.name} in ${interaction.guild.name} (orchestrator only)`);
      await interaction.reply(
        `ðŸ”Š Joined **${voiceChannel.name}**! (Workers unavailable; playback disabled.)`
      );
    } catch (error) {
      log.error(`Error joining voice channel: ${error.message}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(
          createErrorResponse(
            error,
            'Failed to join the voice channel',
            'ðŸ’¡ Make sure I have the necessary permissions and try again.'
          )
        );
      } else {
        await interaction.reply(
          createErrorResponse(
            error,
            'Failed to join the voice channel',
            'ðŸ’¡ Make sure I have the necessary permissions and try again.'
          )
        );
      }
    }
  },
};
