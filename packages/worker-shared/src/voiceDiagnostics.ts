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

/**
 * Forwards @discordjs/voice's own websocket/UDP debug output to our logger.
 *
 * The voice websocket close code is not exposed on any VoiceConnection state,
 * so a connection that opens and immediately falls back to `signalling` gives
 * no indication of why. Requires `debug: true` on the joinVoiceChannel call.
 *
 * Voice identify payloads carry a session token, so they are redacted.
 */
export function attachVoiceConnectionDebug(
  connection: VoiceConnection,
  log: ReturnType<typeof createLogger>,
  context: string
): void {
  connection.on('debug', (message: string) => {
    log.debug(`voice-debug ${context} ${redactTokens(message)}`);
  });
}

function redactTokens(message: string): string {
  return message.replace(/("token"\s*:\s*")[^"]*(")/g, '$1<redacted>$2');
}
