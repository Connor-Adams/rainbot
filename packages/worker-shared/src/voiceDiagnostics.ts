import { VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import type { createLogger } from '@rainbot/shared';

/**
 * Logs every VoiceConnection state transition.
 *
 * A connection that never leaves `signalling` has not received the gateway's
 * VOICE_SERVER_UPDATE, which is indistinguishable from a working join at the
 * call sites — the bot appears in the channel and playback reports success
 * while no audio is ever transmitted. The transition trace is the only way to
 * tell the two apart from the logs.
 */
export function logVoiceConnectionState(
  connection: VoiceConnection,
  log: ReturnType<typeof createLogger>,
  context: string
): void {
  const startedAt = Date.now();
  connection.on('stateChange', (oldState, newState) => {
    const elapsed = Date.now() - startedAt;
    log.info(
      `voice-state ${context} ${oldState.status} -> ${newState.status} (+${elapsed}ms)` +
        (newState.status === VoiceConnectionStatus.Disconnected
          ? ` reason=${'reason' in newState ? newState.reason : 'unknown'}`
          : '')
    );
  });
}
