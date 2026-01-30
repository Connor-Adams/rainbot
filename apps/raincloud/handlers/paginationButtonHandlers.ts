/**
 * Pagination button handlers for queue navigation
 */

import { MessageFlags, EmbedBuilder } from 'discord.js';
import type { ButtonHandler } from '@rainbot/types/buttons';
import { createLogger } from '@utils/logger';
import * as voiceManager from '@utils/voiceManager';
import { createSimplePaginationRow } from '../components/buttons/pagination/paginationButtons';

const log = createLogger('PAGINATION_BUTTONS');

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || isNaN(seconds)) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get YouTube thumbnail from URL
 */
function getYouTubeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  }
  return null;
}

/**
 * Create queue embed for a specific page
 */
function createQueueEmbed(
  guildId: string,
  page: number,
  itemsPerPage: number = 20
): { embed: EmbedBuilder; totalPages: number; actualPage: number } {
  const mediaState = voiceManager.getStatus(guildId);
  const queueState = voiceManager.getQueue(guildId);
  const nowPlaying = queueState.nowPlaying?.title ?? null;
  const currentTrack = queueState.nowPlaying ?? null;
  const queue = queueState.queue ?? [];
  const totalInQueue = queue.length;
  const playbackPositionMs = mediaState?.playback.positionMs ?? 0;
  const hasOverlay = mediaState?.playback.overlayActive === true;
  const isPaused = mediaState?.playback.status === 'paused';
  const channelName = mediaState?.channelName ?? null;

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(totalInQueue / itemsPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const startIndex = safePage * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalInQueue);
  const pageQueue = queue.slice(startIndex, endIndex);

  // Determine embed color based on state
  let embedColor = 0x6366f1; // Default blue
  if (hasOverlay) {
    embedColor = 0x8b5cf6; // Purple when overlay active
  } else if (isPaused) {
    embedColor = 0xf59e0b; // Orange when paused
  }

  const embed = new EmbedBuilder().setTitle('🎵 Music Queue').setColor(embedColor).setTimestamp();

  // Now Playing section
  if (nowPlaying && currentTrack) {
    let description = `**${nowPlaying}**`;

    const trackDurationSeconds =
      currentTrack.duration ?? (currentTrack.durationMs ? currentTrack.durationMs / 1000 : null);
    const playbackPositionSeconds = Math.floor(playbackPositionMs / 1000);
    if (trackDurationSeconds && playbackPositionSeconds > 0) {
      const currentTime = formatDuration(playbackPositionSeconds);
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

  // Queue section
  if (queue.length > 0 && pageQueue.length > 0) {
    const queueList = pageQueue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((track: any, i: number) => {
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

  // Footer
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

  return { embed, totalPages, actualPage: safePage };
}

/**
 * Handle queue pagination buttons
 */
export const handleQueuePaginationButton: ButtonHandler = async (interaction, context) => {
  const { guildId, page } = context;

  if (!guildId) {
    await interaction.reply({
      content: '❌ Guild ID not found',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'No guild ID' };
  }

  if (page === undefined) {
    await interaction.reply({
      content: '❌ Page number not found',
      flags: MessageFlags.Ephemeral,
    });
    return { success: false, error: 'No page number' };
  }

  try {
    const status = voiceManager.getStatus(guildId);
    if (!status) {
      await interaction.update({
        content: "❌ I'm not in a voice channel anymore!",
        embeds: [],
        components: [],
      });
      return { success: false, error: 'Bot not in voice channel' };
    }

    // Create the queue embed for the requested page
    const { embed, totalPages, actualPage } = createQueueEmbed(guildId, page);

    // Add pagination buttons if multiple pages
    const components = [];
    if (totalPages > 1) {
      components.push(createSimplePaginationRow(actualPage, totalPages, guildId));
    }

    await interaction.update({
      embeds: [embed],
      components,
    });

    return {
      success: true,
      data: { page: actualPage, totalPages },
    };
  } catch (error) {
    log.error(`Pagination button error: ${error}`);
    await interaction
      .reply({
        content: `❌ ${error instanceof Error ? error.message : 'Unknown error'}`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
