/**
 * Play command - Multi-bot architecture version
 * Soundboard choices (from autocomplete) → HungerBot. Music/URLs → Rainbot.
 */
const { SlashCommandBuilder } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { getMultiBotService, createWorkerUnavailableResponse } = require('../utils/commandHelpers');

const log = createLogger('PLAY');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a sound file, search for a song, or play from a URL/playlist')
    .addStringOption((option) =>
      option
        .setName('source')
        .setDescription(
          'Sound filename, song name/artist/keywords to search, or YouTube/SoundCloud/Spotify URL'
        )
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const source = interaction.options.getString('source');
    const user = interaction.user.tag;
    const userId = interaction.user.id;

    log.info(`Request: "${source}" by ${user} in ${interaction.guild.name}`);

    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(createWorkerUnavailableResponse());
    }

    // Multi-bot architecture - use worker
    await interaction.deferReply();

    try {
      const result = await service.playSound(
        guildId,
        source,
        userId,
        'discord',
        interaction.user.username
      );

      if (!result.success) {
        return interaction.editReply({
          content: `âŒ ${result.message || 'Failed to play'}`,
        });
      }

      if (result.playedAsSoundboard) {
        log.info(`Soundboard: "${source}" in ${interaction.guild.name}`);
        return interaction.editReply({
          content: `🔊 Playing soundboard`,
        });
      }

      log.info(`Enqueued: "${source}" at position ${result.position} in ${interaction.guild.name}`);
      await interaction.editReply({
        content: `ðŸŽµ Added to queue at position **${result.position}**`,
      });
    } catch (error) {
      log.error(`Failed to play "${source}": ${error.message}`);
      await interaction.editReply({
        content: `âŒ Failed to play "${source}": ${error.message}`,
      });
    }
  },
};
