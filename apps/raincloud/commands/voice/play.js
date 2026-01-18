/**
 * Play command - Multi-bot architecture version
 * Routes music playback through the Rainbot worker
 */
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createLogger } = require('@rainbot/utils');

const log = createLogger('PLAY');

// Try to use multi-bot service, fall back to local voiceManager
async function getPlaybackService() {
  try {
    const { MultiBotService } = require('@rainbot/utils');
    if (MultiBotService.isInitialized()) {
      return { type: 'multibot', service: MultiBotService.getInstance() };
    }
  } catch {
    // Multi-bot service not available
  }

  // Fall back to local voiceManager
  const voiceManager = require('@rainbot/utils');
  return { type: 'local', service: voiceManager };
}

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

    const { type, service } = await getPlaybackService();

    if (type === 'multibot') {
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
            content: `❌ ${result.message || 'Failed to play'}`,
          });
        }

        log.info(
          `Enqueued: "${source}" at position ${result.position} in ${interaction.guild.name}`
        );
        await interaction.editReply({
          content: `🎵 Added to queue at position **${result.position}**`,
        });
      } catch (error) {
        log.error(`Failed to play "${source}": ${error.message}`);
        await interaction.editReply({
          content: `❌ Failed to play "${source}": ${error.message}`,
        });
      }
    } else {
      // Local voiceManager fallback
      const voiceManager = service;
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
        const { createPlayerMessage } = require('@rainbot/utils');
        const result = await voiceManager.playSound(
          guildId,
          source,
          userId,
          'discord',
          interaction.user.username,
          interaction.user.discriminator
        );
        const queueInfo = voiceManager.getQueue(guildId);
        const { nowPlaying, queue, currentTrack } = queueInfo;
        const voiceStatus = voiceManager.getStatus(guildId);
        const isPaused = voiceStatus ? !voiceStatus.isPlaying : false;

        if (result.added === 1) {
          log.info(`Playing: "${result.tracks[0].title}" in ${interaction.guild.name}`);
          await interaction.editReply(
            createPlayerMessage(nowPlaying, queue, isPaused, currentTrack, queueInfo, guildId)
          );
        } else {
          log.info(`Added ${result.added} tracks to queue in ${interaction.guild.name}`);

          const playerMsg = createPlayerMessage(
            nowPlaying,
            queue,
            isPaused,
            currentTrack,
            queueInfo,
            guildId
          );
          playerMsg.content = `📋 Added **${result.added}** track${result.added === 1 ? '' : 's'} to queue!`;
          await interaction.editReply(playerMsg);
        }
      } catch (error) {
        log.error(`Failed to play "${source}": ${error.message}`);
        await interaction.editReply({
          content: `❌ Failed to play "${source}": ${error.message}\n\n💡 **Tips:**\n• Try searching with song name and artist (e.g., "Bohemian Rhapsody Queen")\n• Use direct URLs for YouTube, SoundCloud, or Spotify\n• For sound files, use the exact filename\n• For playlists, use the playlist URL`,
        });
      }
    }
  },
};
