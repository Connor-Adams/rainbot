import type { VoiceConnection } from '@discordjs/voice';
import { recordVoiceConnections, RainbotAttr } from '@rainbot/observability/node';

/**
 * Voice connections are established and torn down from more than one code
 * path: the RPC join/leave handlers (voiceRpcHandlers.ts) and the
 * orchestrator-follow handler (voice-state.ts) both create and destroy
 * `VoiceConnection` instances, and a connection can also tear itself down
 * from its own `'error'` listener or a failed Disconnected-state rejoin,
 * independent of any explicit leave call. If each of those call sites
 * incremented/decremented unconditionally, a connection destroyed by one
 * path (e.g. the `'error'` listener) followed by a leave call on the same
 * now-null `state.connection` would look like a no-op to the leave handler,
 * but a connection torn down and *replaced* (e.g. moving channels in
 * voice-state.ts) could otherwise be double-counted or miscounted depending
 * on call order. Tracking "already counted" per connection object — rather
 * than per call site — makes `markVoiceConnected`/`markVoiceDisconnected`
 * idempotent so the `rainbot.voice.connections` gauge stays accurate no
 * matter which path or order tears a given connection down.
 */
const countedConnections = new WeakSet<VoiceConnection>();

export function markVoiceConnected(connection: VoiceConnection, guildId: string): void {
  if (countedConnections.has(connection)) return;
  countedConnections.add(connection);
  recordVoiceConnections(1, { [RainbotAttr.guildId]: guildId });
}

export function markVoiceDisconnected(connection: VoiceConnection, guildId: string): void {
  if (!countedConnections.has(connection)) return;
  countedConnections.delete(connection);
  recordVoiceConnections(-1, { [RainbotAttr.guildId]: guildId });
}
