/**
 * Now Playing command - Multi-bot architecture version
 */
const { SlashCommandBuilder } = require('discord.js');
const { createPlayerMessage } = require('../../dist/utils/playerEmbed');
const { getMultiBotService } = require('../utils/commandHelpers');
const {
  replyWorkerUnavailable,
  replyNotInVoice,
  replyPayload,
  NOTHING_PLAYING,
} = require('../utils/responseBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('np')
    .setDescription('Show the now playing card with playback controls and queue info'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(replyWorkerUnavailable());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply(replyNotInVoice());
    }

    const nowPlaying = status.queue?.nowPlaying?.title ?? null;
    if (!nowPlaying) {
      return interaction.reply(replyPayload({ content: NOTHING_PLAYING, ephemeral: true }));
    }

    const queueResult = await service.getQueueInfo(guildId);
    const queueState = queueResult.success ? queueResult.queue : null;
    const mediaState = status && queueState ? { ...status, queue: queueState } : status;

    await interaction.reply(createPlayerMessage(mediaState, guildId));
  },
};
