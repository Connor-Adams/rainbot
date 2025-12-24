const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createPlayerMessage } = require('../../dist/utils/playerEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('np')
    .setDescription('Show the now playing card with playback controls and queue info'),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const status = voiceManager.getStatus(guildId);
    if (!status) {
      return interaction.reply({
        content:
          "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
        ephemeral: true,
      });
    }

    if (!status.nowPlaying) {
      return interaction.reply({
        content: '❌ Nothing is playing right now. Use `/play` to start playing music.',
        ephemeral: true,
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
