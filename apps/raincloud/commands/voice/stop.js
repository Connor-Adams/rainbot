/**
 * Stop command - Multi-bot architecture version
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const {
  getMultiBotService,
  createWorkerUnavailableResponse,
  createErrorResponse,
} = require('../utils/commandHelpers');

const log = createLogger('STOP');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription(
      'Stop playback immediately and clear the entire queue (use /clear to keep current track)'
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(createWorkerUnavailableResponse());
    }

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply({
        content: "❌ I'm not in a voice channel! Use `/join` first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const stopped = await service.stop(guildId);

      if (stopped) {
        log.info(`Stopped by ${interaction.user.tag}`);
        await interaction.reply('⏹️ Stopped playback and cleared the queue.');
      } else {
        await interaction.reply({
          content: '❌ Nothing is playing. Use `/play` to start playback.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      log.error(`Stop error: ${error.message}`);
      await interaction.reply(createErrorResponse(error));
    }
  },
};
