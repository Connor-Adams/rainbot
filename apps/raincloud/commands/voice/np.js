/**
 * Now Playing command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createPlayerMessage } = require('../../dist/utils/playerEmbed');
const { validateVoiceConnection } = require('../utils/commandHelpers');

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

  const voiceManager = require('../../dist/utils/voiceManager');
  return { type: 'local', service: voiceManager };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('np')
    .setDescription('Show the now playing card with playback controls and queue info'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
      const status = await service.getStatus(guildId);
      if (!status || !status.isConnected) {
        return interaction.reply({
          content: "❌ I'm not in a voice channel! Use `/join` first.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!status.nowPlaying) {
        return interaction.reply({
          content: '❌ Nothing is playing right now. Use `/play` to start playing music.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const queueResult = await service.getQueueInfo(guildId);
      const queueInfo = queueResult.success
        ? queueResult.queue || queueResult
        : {
            nowPlaying: status.nowPlaying,
            queue: [],
            currentTrack: null,
          };

      const { nowPlaying, queue, currentTrack } = queueInfo;
      const isPaused = !status.isPlaying;

      await interaction.reply(
        createPlayerMessage(nowPlaying, queue, isPaused, currentTrack, queueInfo)
      );
    } else {
      const voiceManager = service;
      const connectionCheck = validateVoiceConnection(interaction, voiceManager);
      if (!connectionCheck.isValid) {
        return interaction.reply(connectionCheck.error);
      }

      const status = voiceManager.getStatus(guildId);
      if (!status.nowPlaying) {
        return interaction.reply({
          content: '❌ Nothing is playing right now. Use `/play` to start playing music.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const queueInfo = voiceManager.getQueue(guildId);
      const { nowPlaying, queue, currentTrack } = queueInfo;
      const isPaused = !status.isPlaying;

      await interaction.reply(
        createPlayerMessage(nowPlaying, queue, isPaused, currentTrack, queueInfo)
      );
    }
  },
};
