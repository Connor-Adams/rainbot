/**
 * Queue command - Multi-bot architecture version
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  formatDuration,
  getYouTubeThumbnail,
  getMultiBotService,
} = require('../utils/commandHelpers');
const { replyNotInVoice, replyWorkerUnavailable } = require('../utils/responseBuilder');
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
    const pageIndex = requestedPage - 1;
    const service = await getMultiBotService();
    if (!service) {
      return interaction.reply(replyWorkerUnavailable());
    }

    let queueState;
    let mediaState;

    const status = await service.getStatus(guildId);
    if (!status || !status.connected) {
      return interaction.reply(replyNotInVoice());
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

    const ITEMS_PER_PAGE = 20;
    const totalPages = Math.max(1, Math.ceil(totalInQueue / ITEMS_PER_PAGE));
    const safePage = Math.max(0, Math.min(pageIndex, totalPages - 1));
    const startIndex = safePage * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalInQueue);
    const pageQueue = queue.slice(startIndex, endIndex);

    let embedColor = 0x6366f1;
    if (hasOverlay) {
      embedColor = 0x8b5cf6;
    } else if (isPaused) {
      embedColor = 0xf59e0b;
    }

    const embed = new EmbedBuilder().setTitle('🎵 Music Queue').setColor(embedColor).setTimestamp();

    if (nowPlaying && currentTrack) {
      let description = `**${nowPlaying}**`;

      const trackDurationSeconds =
        currentTrack.duration ?? (currentTrack.durationMs ? currentTrack.durationMs / 1000 : null);
      if (trackDurationSeconds && playbackPosition > 0) {
        const currentTime = formatDuration(playbackPosition);
        const totalTime = formatDuration(trackDurationSeconds);
        description += `\n\`${currentTime} / ${totalTime}\``;
      } else if (trackDurationSeconds) {
        description += ` • \`${formatDuration(trackDurationSeconds)}\``;
      }

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

    const components = [];
    if (totalPages > 1) {
      try {
        const {
          createSimplePaginationRow,
        } = require('../../dist/components/buttons/pagination/paginationButtons');
        components.push(createSimplePaginationRow(safePage, totalPages, guildId));
      } catch (error) {
        log.warn(`Pagination buttons not available: ${error.message}`);
      }
    }

    await interaction.reply({ embeds: [embed], components });
  },
};
