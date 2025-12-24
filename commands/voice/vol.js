const { SlashCommandBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createLogger } = require('../../dist/utils/logger');
const { validateVoiceConnection, createErrorResponse } = require('../utils/commandHelpers');

const log = createLogger('VOLUME');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vol')
    .setDescription('Get or set the playback volume')
    .addIntegerOption((option) =>
      option.setName('level').setDescription('Volume level (1–100)').setMinValue(1).setMaxValue(100)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const level = interaction.options.getInteger('level');
    const user = interaction.user.tag;

    const connectionCheck = validateVoiceConnection(interaction, voiceManager);
    if (!connectionCheck.isValid) {
      return interaction.reply(connectionCheck.error);
    }

    const status = voiceManager.getStatus(guildId);
    if (level === null) {
      return interaction.reply({
        content: `🔊 Current volume is **${status.volume}%**`,
        ephemeral: true,
      });
    }

    try {
      voiceManager.setVolume(guildId, level);
      log.info(`Volume set to ${level}% by ${user}`);

      await interaction.reply({
        content: `🔊 Volume set to **${level}%**`,
      });
    } catch (error) {
      log.error(`Failed to set volume: ${error.message}`);
      await interaction.reply(createErrorResponse(error, 'Failed to set volume'));
    }
  },
};
