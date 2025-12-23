const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the current voice channel (playback and queue will stop)'),

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

    try {
      const channelName = status.channelName;
      voiceManager.leaveChannel(guildId);
      await interaction.reply(`👋 Left **${channelName}**! The queue has been cleared.`);
    } catch (error) {
      await interaction.reply({
        content: `❌ Failed to leave the voice channel: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
