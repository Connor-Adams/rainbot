import { EmbedBuilder } from 'discord.js';
import type { QueueInfo } from '../../types/voice';
import { formatDuration } from '../../utils/playerEmbed';

const voiceManager = require('../../utils/voiceManager');

function getYouTubeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  }
  return null;
}

export function executeNowPlaying(guildId: string): QueueInfo {
  return voiceManager.getQueue(guildId) as QueueInfo;
}

export function createNowPlayingEmbed(queueInfo: QueueInfo): EmbedBuilder {
  const { nowPlaying, playbackPosition = 0, isPaused = false, hasOverlay = false } = queueInfo;
  const currentTrack = queueInfo.currentTrack || null;

  const embed = new EmbedBuilder().setTitle('🎵 Now Playing').setColor(0x6366f1).setTimestamp();

  if (nowPlaying && currentTrack) {
    let description = `**${nowPlaying}**`;

    // Show playback progress
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

  return embed;
}
