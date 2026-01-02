const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const voiceManager = require('../../dist/utils/voiceManager');
const {
  validateVoiceConnection,
  formatDuration,
  getYouTubeThumbnail,
} = require('../utils/commandHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription("View the current music queue and what's playing now")
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('Page number to view (default: 1)')
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const requestedPage = interaction.options.getInteger('page') || 1;
    const pageIndex = requestedPage - 1; // Convert to 0-indexed

    const connectionCheck = validateVoiceConnection(interaction, voiceManager);
    if (!connectionCheck.isValid) {
      return interaction.reply(connectionCheck.error);
    }

    const queueInfo = voiceManager.getQueue(guildId);
    const {
      nowPlaying,
      queue,
      totalInQueue,
      currentTrack,
      playbackPosition,
      hasOverlay,
      isPaused,
      channelName,
    } = queueInfo;

    // Pagination settings
    const ITEMS_PER_PAGE = 20;
    const totalPages = Math.max(1, Math.ceil(totalInQueue / ITEMS_PER_PAGE));
    const safePage = Math.max(0, Math.min(pageIndex, totalPages - 1));
    const startIndex = safePage * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalInQueue);
    const pageQueue = queue.slice(startIndex, endIndex);

    // Determine embed color based on state
    let embedColor = 0x6366f1; // Default blue
    if (hasOverlay) {
      embedColor = 0x8b5cf6; // Purple when overlay active
    } else if (isPaused) {
      embedColor = 0xf59e0b; // Orange when paused
    }

    const embed = new EmbedBuilder().setTitle('🎵 Music Queue').setColor(embedColor).setTimestamp();

    // Now Playing section with playback position
    if (nowPlaying && currentTrack) {
      let description = `**${nowPlaying}**`;

      // Show playback progress if available
      if (currentTrack.duration && playbackPosition > 0) {
        const currentTime = formatDuration(playbackPosition);
        const totalTime = formatDuration(currentTrack.duration);
        description += `\n\`${currentTime} / ${totalTime}\``;
      } else if (currentTrack.duration) {
        description += ` • \`${formatDuration(currentTrack.duration)}\``;
      }

      // Add state indicators
      if (hasOverlay) {
        description += '\n\n🔊 *Soundboard overlay active*';
      } else if (isPaused) {
        description += '\n\n⏸️ *Paused*';
      }

      const thumbnail = getYouTubeThumbnail(currentTrack.url);
      if (thumbnail && !currentTrack.isSoundboard) {
        embed.setThumbnail(thumbnail);
      }

      embed.setDescription(description);
    } else if (nowPlaying) {
      embed.setDescription(`**${nowPlaying}**`);
    } else {
      embed.setDescription('*Nothing playing*');
    }

    // Queue section with pagination
    if (queue.length > 0) {
      const queueList = pageQueue
        .map((track, i) => {
          const num = (startIndex + i + 1).toString().padStart(2, '0');
          const duration = track.duration ? ` \`${formatDuration(track.duration)}\`` : '';
          return `\`${num}\` ${track.title}${duration}`;
        })
        .join('\n');

      const pageInfo = totalPages > 1 ? ` (Page ${safePage + 1}/${totalPages})` : '';

      embed.addFields({
        name: `📋 Up Next — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}${pageInfo}`,
        value: queueList || '*No tracks on this page*',
        inline: false,
      });
    } else {
      embed.addFields({
        name: '📋 Queue',
        value: '*Queue is empty*\n\nUse `/play` to add tracks!',
        inline: false,
      });
    }

    // Build footer with state info
    let footerText = `Total: ${totalInQueue} track${totalInQueue === 1 ? '' : 's'} in queue`;
    if (channelName) {
      footerText += ` • ${channelName}`;
    }
    if (hasOverlay) {
      footerText += ' • 🔊 Overlay Active';
    } else if (isPaused) {
      footerText += ' • ⏸️ Paused';
    }

    embed.setFooter({ text: footerText });

    // Add pagination buttons if there are multiple pages
    const components = [];
    if (totalPages > 1) {
      try {
        const {
          createSimplePaginationRow,
        } = require('../../dist/components/buttons/pagination/paginationButtons');
        components.push(createSimplePaginationRow(safePage, totalPages, guildId));
      } catch (error) {
        // If pagination buttons aren't available yet, just show the queue without buttons
        console.warn('Pagination buttons not available:', error.message);
      }
    }

    await interaction.reply({ embeds: [embed], components });
  },
};
