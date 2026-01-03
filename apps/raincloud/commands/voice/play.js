const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const { createPlayerMessage } = require('../../dist/utils/playerEmbed');
const { createLogger } = require('../../dist/utils/logger');

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

    log.info(`Request: "${source}" by ${user} in ${interaction.guild.name}`);

    const status = voiceManager.getStatus(guildId);
    if (!status) {
      return interaction.reply({
        content:
          "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      const result = await voiceManager.playSound(
        guildId,
        source,
        interaction.user.id,
        'discord',
        interaction.user.username,
        interaction.user.discriminator
      );
      const queueInfo = voiceManager.getQueue(guildId);
      const { nowPlaying, queue, currentTrack } = queueInfo;
      const status = voiceManager.getStatus(guildId);
      const isPaused = status ? !status.isPlaying : false;

      if (result.added === 1) {
        log.info(`Playing: "${result.tracks[0].title}" in ${interaction.guild.name}`);
        await interaction.editReply(
          createPlayerMessage(nowPlaying, queue, isPaused, currentTrack, queueInfo)
        );
      } else {
        log.info(`Added ${result.added} tracks to queue in ${interaction.guild.name}`);

        // Show playlist added message with player
        const playerMsg = createPlayerMessage(nowPlaying, queue, isPaused, currentTrack, queueInfo);
        playerMsg.content = `📋 Added **${result.added}** track${result.added === 1 ? '' : 's'} to queue!`;
        await interaction.editReply(playerMsg);
      }
    } catch (error) {
      log.error(`Failed to play "${source}": ${error.message}`);
      await interaction.editReply({
        content: `❌ Failed to play "${source}": ${error.message}\n\n💡 **Tips:**\n• Try searching with song name and artist (e.g., "Bohemian Rhapsody Queen")\n• Use direct URLs for YouTube, SoundCloud, or Spotify\n• For sound files, use the exact filename\n• For playlists, use the playlist URL`,
      });
    }
  },
};
