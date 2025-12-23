const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('CLEAR');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription(
      'Clear the music queue while keeping the current track playing (use /stop to stop everything)'
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
      const cleared = voiceManager.clearQueue(guildId);
      log.info(`Cleared ${cleared} tracks by ${interaction.user.tag}`);

      const { nowPlaying } = voiceManager.getQueue(guildId);
      const currentTrack = nowPlaying ? `\n\n▶️ Still playing: **${nowPlaying}**` : '';

      if (cleared === 0) {
        await interaction.reply(`📋 Queue was already empty.${currentTrack}`);
      } else {
        await interaction.reply(
          `🗑️ Cleared **${cleared}** track${cleared === 1 ? '' : 's'} from the queue.${currentTrack}`
        );
      }
    } catch (error) {
      log.error(`Clear error: ${error.message}`);
      await interaction.reply({
        content: `❌ ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
