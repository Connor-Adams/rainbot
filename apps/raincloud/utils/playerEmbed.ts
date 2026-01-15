import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Track, QueueInfo } from '@rainbot/protocol';
import { createButtonId } from '../components/builders/buttonBuilder';

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number | null | undefined): string | null {
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
 * Extract YouTube video ID from URL
 */
export function getYouTubeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  }
  return null;
}

/**
 * Create a now playing embed with control buttons
 */
export function createPlayerEmbed(
  nowPlaying: string | null,
  queue: Track[],
  isPaused: boolean = false,
  currentTrack: Track | null = null,
  queueInfo: Partial<QueueInfo> = {}
): EmbedBuilder {
  const {
    playbackPosition = 0,
    hasOverlay = false,
    totalInQueue = queue.length,
    channelName = null,
  } = queueInfo;

  // Determine embed color based on state
  let embedColor = 0x6366f1; // Default blue
  if (hasOverlay) {
    embedColor = 0x8b5cf6; // Purple when overlay active
  } else if (isPaused) {
    embedColor = 0xf59e0b; // Orange when paused
  }

  const embed = new EmbedBuilder().setColor(embedColor).setTimestamp();

  // Get current track info if available
  let trackTitle = nowPlaying || 'Nothing playing';
  let trackDuration: number | null = null;
  let trackUrl: string | null = null;
  let isSoundboard = false;

  if (currentTrack) {
    trackTitle = currentTrack.title || trackTitle;
    trackDuration = currentTrack.duration ?? null;
    trackUrl = currentTrack.url ?? null;
    isSoundboard = currentTrack.isSoundboard || trackTitle.startsWith('🔊');
  } else if (queue.length > 0 && queue[0]) {
    // Try to get info from first queue item if it matches
    trackUrl = queue[0].url ?? null;
  }

  // Set title based on state
  let title = '🎵 Now Playing';
  if (hasOverlay) {
    title = '🔊 Soundboard Overlay Active';
  } else if (isPaused) {
    title = '⏸️ Paused';
  } else if (isSoundboard) {
    title = '🔊 Soundboard';
  }
  embed.setTitle(title);

  // Set thumbnail if YouTube URL
  const thumbnail = getYouTubeThumbnail(trackUrl);
  if (thumbnail && !isSoundboard) {
    embed.setThumbnail(thumbnail);
  }

  // Build description with position and duration
  let description = `**${trackTitle}**`;

  if (trackDuration && playbackPosition > 0) {
    // Show progress: current / total
    const currentTime = formatDuration(playbackPosition);
    const totalTime = formatDuration(trackDuration);
    description += `\n\`${currentTime} / ${totalTime}\``;
  } else if (trackDuration) {
    description += ` • \`${formatDuration(trackDuration)}\``;
  }

  // Add overlay indicator
  if (hasOverlay) {
    description += '\n\n🔊 *Soundboard overlay active*';
  }

  embed.setDescription(description);

  // Add queue preview
  if (queue.length > 0) {
    const upNext = queue
      .slice(0, 5)
      .map((t, i) => {
        const num = (i + 1).toString().padStart(2, '0');
        const duration = t.duration ? ` \`${formatDuration(t.duration)}\`` : '';
        const source = t.isLocal ? '🔊' : '';
        return `\`${num}\` ${source}${t.title}${duration}`;
      })
      .join('\n');

    const moreText = totalInQueue > 5 ? `\n*...and ${totalInQueue - 5} more*` : '';

    embed.addFields({
      name: `📋 Queue — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}`,
      value: upNext + moreText,
      inline: false,
    });
  } else {
    embed.addFields({
      name: '📋 Queue',
      value: '*Queue is empty*',
      inline: false,
    });
  }

  // Add footer with status and channel info
  const statusEmoji = hasOverlay ? '🔊' : isPaused ? '⏸️' : '▶️';
  let footerText = `${statusEmoji} ${hasOverlay ? 'Overlay Active' : isPaused ? 'Paused' : 'Playing'}`;
  if (channelName) {
    footerText += ` • ${channelName}`;
  }
  footerText += ' • Use /play to add tracks';
  embed.setFooter({ text: footerText });

  return embed;
}

/**
 * Create control buttons row
 *
 * Note: This function is maintained for backward compatibility.
 * New code should use the components from ../components/buttons/music/controlButtons
 */
export function createControlButtons(
  isPaused: boolean = false,
  hasQueue: boolean = false,
  guildId?: string
): ActionRowBuilder<ButtonBuilder> {
  const metadata = guildId ? { guildId } : undefined;
  const pauseId = metadata ? createButtonId('player_pause', metadata) : 'player_pause';
  const skipId = metadata ? createButtonId('player_skip', metadata) : 'player_skip';
  const stopId = metadata ? createButtonId('player_stop', metadata) : 'player_stop';
  const queueId = metadata ? createButtonId('player_queue', metadata) : 'player_queue';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(pauseId)
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(skipId)
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasQueue),
    new ButtonBuilder()
      .setCustomId(stopId)
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(queueId)
      .setLabel('View Queue')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)
  );

  return row;
}

/**
 * Create full player message components
 */
export function createPlayerMessage(
  nowPlaying: string | null,
  queue: Track[],
  isPaused: boolean = false,
  currentTrack: Track | null = null,
  queueInfo: Partial<QueueInfo> = {},
  guildId?: string
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[]; content?: string } {
  const hasQueue = (queueInfo.totalInQueue ?? queue.length) > 0;
  return {
    embeds: [createPlayerEmbed(nowPlaying, queue, isPaused, currentTrack, queueInfo)],
    components: [createControlButtons(isPaused, hasQueue, guildId)],
  };
}
