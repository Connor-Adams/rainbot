/**
 * Queue command - Multi-bot architecture version
 */
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  formatDuration,
  getYouTubeThumbnail,
  getMultiBotService,
  createWorkerUnavailableResponse,
} = require('../utils/commandHelpers');
const { createLogger } = require('../../dist/utils/logger');

const log = createLogger('QUEUE_CMD');

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
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(createWorkerUnavailableResponse());
    }

    let queueState;
    let mediaState;

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply({
        content: "âŒ I'm not in a voice channel! Use `/join` first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    mediaState = status;
    const queueInfo = await service.getQueueInfo(guildId);
    queueState = queueInfo.success ? queueInfo.queue : { queue: [] };
    const nowPlaying = queueState?.nowPlaying?.title ?? null;
    const currentTrack = queueState?.nowPlaying ?? null;
    const queue = queueState?.queue ?? [];
    const totalInQueue = queue.length;
    const playbackPosition = Math.floor((mediaState?.playback?.positionMs ?? 0) / 1000);
    const hasOverlay = mediaState?.playback?.overlayActive === true;
    const isPaused = mediaState?.playback?.status === 'paused';
    const channelName = mediaState?.channelName ?? null;

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

    const embed = new EmbedBuilder()
      .setTitle('ðŸŽµ Music Queue')
      .setColor(embedColor)
      .setTimestamp();

    // Now Playing section with playback position
    if (nowPlaying && currentTrack) {
      let description = `**${nowPlaying}**`;

      // Show playback progress if available
      const trackDurationSeconds =
        currentTrack.duration ?? (currentTrack.durationMs ? currentTrack.durationMs / 1000 : null);
      if (trackDurationSeconds && playbackPosition > 0) {
        const currentTime = formatDuration(playbackPosition);
        const totalTime = formatDuration(trackDurationSeconds);
        description += `\n\`${currentTime} / ${totalTime}\``;
      } else if (trackDurationSeconds) {
        description += ` â€¢ \`${formatDuration(trackDurationSeconds)}\``;
      }

      // Add state indicators
      if (hasOverlay) {
        description += '\n\nðŸ”Š *Soundboard overlay active*';
      } else if (isPaused) {
        description += '\n\nâ¸ï¸ *Paused*';
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
          const durationSeconds =
            track.duration ?? (track.durationMs ? track.durationMs / 1000 : null);
          const duration = durationSeconds ? ` \`${formatDuration(durationSeconds)}\`` : '';
          return `\`${num}\` ${track.title}${duration}`;
        })
        .join('\n');

      const pageInfo = totalPages > 1 ? ` (Page ${safePage + 1}/${totalPages})` : '';

      embed.addFields({
        name: `ðŸ“‹ Up Next â€” ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}${pageInfo}`,
        value: queueList || '*No tracks on this page*',
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'ðŸ“‹ Queue',
        value: '*Queue is empty*\n\nUse `/play` to add tracks!',
        inline: false,
      });
    }

    // Build footer with state info
    let footerText = `Total: ${totalInQueue} track${totalInQueue === 1 ? '' : 's'} in queue`;
    if (channelName) {
      footerText += ` â€¢ ${channelName}`;
    }
    if (hasOverlay) {
      footerText += ' â€¢ ðŸ”Š Overlay Active';
    } else if (isPaused) {
      footerText += ' â€¢ â¸ï¸ Paused';
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
        log.warn(`Pagination buttons not available: ${error.message}`);
      }
    }

    await interaction.reply({ embeds: [embed], components });
  },
};
