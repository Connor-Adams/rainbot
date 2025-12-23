import { EmbedBuilder } from 'discord.js';
import type { PlayCommandResult } from '../../types/commands';
import type { PlayResult } from '../../types/voice';

// const voiceManager = require('../../utils/voiceManager');

export async function executePlay(
  _guildId: string,
  _source: string,
  _userId?: string
): Promise<PlayCommandResult> {
  // Placeholder implementation - this should call voiceManager.playSound
  // For now, return a valid result structure
  try {
    // const result = await voiceManager.playSound(guildId, source, userId);
    const result: PlayResult = {
      added: 0,
      tracks: [],
      totalInQueue: 0,
    };
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function createPlayEmbed(commandResult: PlayCommandResult): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('🎵 Added to Queue').setColor(0x6366f1);

  // Handle error case
  if (!commandResult.success || !commandResult.result) {
    embed.setDescription(`❌ ${commandResult.error || 'Failed to add to queue'}`);
    embed.setColor(0xef4444);
    return embed;
  }

  const playResult = commandResult.result;

  if (playResult.tracks.length === 1) {
    const track = playResult.tracks[0];
    if (track) {
      embed.setDescription(`**${track.title}**`);

      if (track.url) {
        const match = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match) {
          embed.setThumbnail(`https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`);
        }
      }
    }
  } else {
    embed.setDescription(`Added **${playResult.added}** tracks to queue`);
  }

  // Show queue position
  embed.addFields({
    name: 'Queue Position',
    value: `${playResult.totalInQueue} total tracks`,
    inline: true,
  });

  return embed;
}
