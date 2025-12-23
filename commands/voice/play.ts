import { EmbedBuilder } from 'discord.js';
import type { PlayCommandResult } from '../../types/commands';
import type { PlayResult } from '../../types/voice';

const voiceManager = require('../../utils/voiceManager');

export async function executePlay(
  guildId: string,
  _source: string,
  _userId?: string
): Promise<PlayCommandResult> {
  // Implementation here - just showing type fix
  const result: PlayResult = {
    added: 0,
    tracks: [],
    totalInQueue: 0,
  };
  return { result };
}

export function createPlayEmbed(result: PlayCommandResult): EmbedBuilder {
  const { result: playResult } = result;
  const embed = new EmbedBuilder().setTitle('🎵 Added to Queue').setColor(0x6366f1);

  if (playResult.tracks.length === 1) {
    const track = playResult.tracks[0];
    embed.setDescription(`**${track.title}**`);

    if (track.url) {
      const match = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (match) {
        embed.setThumbnail(`https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`);
      }
    }
  } else {
    embed.setDescription(`Added **${playResult.added}** tracks to queue`);
  }

  // Show current track if provided
  if (playResult.tracks[0]) {
    embed.addFields({
      name: 'Queue Position',
      value: `${playResult.totalInQueue} total tracks`,
      inline: true,
    });
  }

  return embed;
}
