
import { EmbedBuilder } from 'discord.js';
import type { PingResult } from '../../types/commands';

export interface PingExecuteResult {
  roundtrip: number;
  websocket: number;
}

export function executePing(roundtrip: number, websocket: number): PingExecuteResult {
  return {
    roundtrip,
    websocket,
  };
}

export function createPingEmbed(result: PingExecuteResult): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🏓 Pong!')
    .setColor(0x6366f1)
    .addFields(
      { name: '⏱️ Roundtrip', value: `${result.roundtrip}ms`, inline: true },
      { name: '💓 WebSocket', value: `${result.websocket}ms`, inline: true }
    )
    .setTimestamp();
}

