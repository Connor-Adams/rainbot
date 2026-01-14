// util-category: discord
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Track, QueueInfo } from '@rainbot/protocol';

/* ============================================================================
 * FORMATTERS
 * ============================================================================
 */

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0 || Number.isNaN(seconds)) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Extract YouTube thumbnail from URL
 */
export function getYouTubeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;

  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

  return match ? `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg` : null;
}

/* ============================================================================
 * PLAYER STATE DERIVATION
 * ============================================================================
 */

interface DerivedPlayerState {
  title: string;
  description: string;
  color: number;
  footer: string;
  thumbnail?: string;
}

/**
 * Build all visual state in one place.
 * This keeps rendering logic dumb and maintainable.
 */
function derivePlayerState(
  nowPlaying: string | null,
  queue: Track[],
  isPaused: boolean,
  currentTrack: Track | null,
  queueInfo: Partial<QueueInfo>
): DerivedPlayerState {
  const playbackPosition = queueInfo.playbackPosition ?? 0;
  const hasOverlay = queueInfo.hasOverlay ?? false;
  const channelName = queueInfo.channelName ?? null;

  const track = currentTrack ?? null;
  const titleText = track?.title ?? nowPlaying ?? 'Nothing playing';
  const isSoundboard = Boolean(track?.isSoundboard || track?.isLocal);

  /* ---------- COLOR ---------- */
  let color = 0x6366f1; // Blue
  if (hasOverlay)
    color = 0x8b5cf6; // Purple
  else if (isPaused) color = 0xf59e0b; // Orange

  /* ---------- TITLE ---------- */
  let title = '🎵 Now Playing';
  if (hasOverlay) title = '🔊 Soundboard Overlay Active';
  else if (isPaused) title = '⏸️ Paused';
  else if (isSoundboard) title = '🔊 Soundboard';

  /* ---------- DESCRIPTION ---------- */
  let description = `**${titleText}**`;

  const duration = track?.duration ?? null;
  if (duration) {
    const total = formatDuration(duration);
    const current = formatDuration(playbackPosition);
    description += current ? `\n\`${current} / ${total}\`` : ` • \`${total}\``;
  }

  if (hasOverlay) {
    description += '\n\n🔊 *Soundboard overlay active*';
  }

  /* ---------- FOOTER ---------- */
  const statusEmoji = hasOverlay ? '🔊' : isPaused ? '⏸️' : '▶️';
  let footer = `${statusEmoji} ${hasOverlay ? 'Overlay Active' : isPaused ? 'Paused' : 'Playing'}`;

  if (channelName) footer += ` • ${channelName}`;
  footer += ' • Use /play to add tracks';

  /* ---------- THUMBNAIL ---------- */
  const thumbnail = !isSoundboard && track?.url ? getYouTubeThumbnail(track.url) : undefined;

  return {
    title,
    description,
    color,
    footer,
    thumbnail,
  };
}

/* ============================================================================
 * EMBEDS
 * ============================================================================
 */

export function createPlayerEmbed(
  nowPlaying: string | null,
  queue: Track[],
  isPaused = false,
  currentTrack: Track | null = null,
  queueInfo: Partial<QueueInfo> = {}
): EmbedBuilder {
  const totalInQueue = queueInfo.totalInQueue ?? queue.length;

  const derived = derivePlayerState(nowPlaying, queue, isPaused, currentTrack, queueInfo);

  const embed = new EmbedBuilder()
    .setColor(derived.color)
    .setTitle(derived.title)
    .setDescription(derived.description)
    .setTimestamp()
    .setFooter({ text: derived.footer });

  if (derived.thumbnail) {
    embed.setThumbnail(derived.thumbnail);
  }

  /* ---------- QUEUE PREVIEW ---------- */
  if (queue.length > 0) {
    const preview = queue
      .slice(0, 5)
      .map((track, index) => {
        const number = (index + 1).toString().padStart(2, '0');
        const duration = track.duration ? ` \`${formatDuration(track.duration)}\`` : '';
        const icon = track.isLocal ? '🔊 ' : '';
        return `\`${number}\` ${icon}${track.title}${duration}`;
      })
      .join('\n');

    const overflow = totalInQueue > 5 ? `\n*...and ${totalInQueue - 5} more*` : '';

    embed.addFields({
      name: `📋 Queue — ${totalInQueue} track${totalInQueue === 1 ? '' : 's'}`,
      value: preview + overflow,
      inline: false,
    });
  } else {
    embed.addFields({
      name: '📋 Queue',
      value: '*Queue is empty*',
      inline: false,
    });
  }

  return embed;
}

/* ============================================================================
 * COMPONENTS
 * ============================================================================
 */

export function createControlButtons(
  isPaused = false,
  hasQueue = false
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('player_pause')
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('player_skip')
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasQueue),

    new ButtonBuilder()
      .setCustomId('player_stop')
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('player_queue')
      .setLabel('View Queue')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)
  );
}

/* ============================================================================
 * PUBLIC MESSAGE FACTORY
 * ============================================================================
 */

export function createPlayerMessage(
  nowPlaying: string | null,
  queue: Track[],
  isPaused = false,
  currentTrack: Track | null = null,
  queueInfo: Partial<QueueInfo> = {}
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const totalInQueue = queueInfo.totalInQueue ?? queue.length;

  return {
    embeds: [createPlayerEmbed(nowPlaying, queue, isPaused, currentTrack, queueInfo)],
    components: [createControlButtons(isPaused, totalInQueue > 0)],
  };
}
