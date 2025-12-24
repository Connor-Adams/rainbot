const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('STOP');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription(
      'Stop playback immediately and clear the entire queue (use /clear to keep current track)'
    ),

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
      const stopped = voiceManager.stopSound(guildId);

      if (stopped) {
        log.info(`Stopped by ${interaction.user.tag}`);
        await interaction.reply('⏹️ Stopped playback and cleared the queue.');
      } else {
        await interaction.reply({
          content: '❌ Nothing is playing. Use `/play` to start playback.',
          ephemeral: true,
        });
      }
    } catch (error) {
      log.error(`Stop error: ${error.message}`);
      await interaction.reply({
        content: `❌ ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
