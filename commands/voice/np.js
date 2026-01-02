const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createPlayerMessage } = require('../../dist/utils/playerEmbed');
const { validateVoiceConnection } = require('../utils/commandHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('np')
    .setDescription('Show the now playing card with playback controls and queue info'),

  async execute(interaction) {
    const guildId = interaction.guildId;

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
  },
};
