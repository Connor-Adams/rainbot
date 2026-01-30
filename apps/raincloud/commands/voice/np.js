/**
 * Now Playing command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createPlayerMessage } = require('../../dist/utils/playerEmbed');
const { getMultiBotService, createWorkerUnavailableResponse } = require('../utils/commandHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('np')
    .setDescription('Show the now playing card with playback controls and queue info'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(createWorkerUnavailableResponse());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply({
        content: "âŒ I'm not in a voice channel! Use `/join` first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const nowPlaying = status.queue?.nowPlaying?.title ?? null;
    if (!nowPlaying) {
      return interaction.reply({
        content: 'âŒ Nothing is playing right now. Use `/play` to start playing music.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const queueResult = await service.getQueueInfo(guildId);
    const queueState = queueResult.success ? queueResult.queue : null;
    const mediaState = status && queueState ? { ...status, queue: queueState } : status;

    await interaction.reply(createPlayerMessage(mediaState, guildId));
  },
};

