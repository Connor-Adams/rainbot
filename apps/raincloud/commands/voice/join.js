/**
 * Join command - Multi-bot architecture version
 * Connects all worker bots to the voice channel
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { checkVoicePermissions, createErrorResponse } = require('../utils/commandHelpers');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('JOIN');

// Try to use multi-bot service, fall back to local voiceManager
async function getPlaybackService() {
  try {
    const { MultiBotService } = require('../../dist/lib/multiBotService');
    if (MultiBotService.isInitialized()) {
      return { type: 'multibot', service: MultiBotService.getInstance() };
    }
  } catch {
    // Multi-bot service not available
  }

  // Fall back to local voiceManager
  const voiceManager = require('../../dist/utils/voiceManager');
  return { type: 'local', service: voiceManager };
}

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

    const { type, service } = await getPlaybackService();

    try {
      if (type === 'multibot') {
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
          `🔊 Joined **${voiceChannel.name}**! Use \`/play\` to start playing music.`
        );
      } else {
        // Local voiceManager fallback
        const voiceManager = service;
        await voiceManager.joinChannel(voiceChannel);

        // Pranjeet will auto-follow raincloud and handle voice listening when enabled
        log.info(`Joined ${voiceChannel.name} in ${interaction.guild.name}`);
        await interaction.reply(
          `🔊 Joined **${voiceChannel.name}**! Use \`/play\` to start playing music.`
        );
      }
    } catch (error) {
      log.error(`Error joining voice channel: ${error.message}`);
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
