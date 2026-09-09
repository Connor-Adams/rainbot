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
  const instrumented = new WeakSet<object>();
  connection.on('stateChange', (oldState, newState) => {
    const elapsed = Date.now() - startedAt;
    log.info(
      `voice-state ${context} ${oldState.status} -> ${newState.status} (+${elapsed}ms)` +
        (newState.status === VoiceConnectionStatus.Disconnected
          ? ` reason=${'reason' in newState ? newState.reason : 'unknown'}`
          : '')
    );
    logNetworkingClose(newState, log, context, instrumented);
  });
}

/**
 * Records the voice websocket close code.
 *
 * VoiceConnection.onNetworkingClose turns every close code except 4014 into a
 * silent fall back to `signalling`, discarding the code — which is the only
 * thing that distinguishes a rejected identify (4017 when Discord requires the
 * DAVE protocol, 4004/4006 for auth and session problems) from a network drop.
 * The Networking instance hangs off the connection state and emits the code, so
 * listen there. A new instance is created per connection attempt, hence the
 * WeakSet.
 */
function logNetworkingClose(
  state: unknown,
  log: ReturnType<typeof createLogger>,
  context: string,
  instrumented: WeakSet<object>
): void {
  const networking = (state as { networking?: { on?: unknown } }).networking;
  if (!networking || typeof networking.on !== 'function') return;
  if (instrumented.has(networking)) return;
  instrumented.add(networking);
  (networking as { on: (event: string, listener: (code: number) => void) => void }).on(
    'close',
    (code: number) => {
      log.warn(`voice-ws-close ${context} code=${code}`);
    }
  );
}
