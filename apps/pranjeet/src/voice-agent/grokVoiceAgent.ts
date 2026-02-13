/**
 * xAI Voice Agent API client (real-time voice with Grok).
 * https://docs.x.ai/developers/model-capabilities/audio/voice-agent
 *
 * Connects via WebSocket to wss://api.x.ai/v1/realtime, streams Discord
 * audio (resampled to 24kHz mono), receives Grok's voice response and plays it.
 */
import WebSocket from 'ws';
import { createLogger } from '@rainbot/shared';
import { resample48kStereoTo24kMono } from '../audio/utils';
import { GROK_API_KEY, GROK_ENABLED } from '../config';

const log = createLogger('GROK_VOICE_AGENT');
const XAI_REALTIME_URL = 'wss://api.x.ai/v1/realtime';

const VOICE_AGENT_INSTRUCTIONS =
  'You are a helpful, concise voice assistant in a Discord voice channel. Keep replies short and natural for spoken conversation.';

export interface GrokVoiceAgentCallbacks {
  /** Called when Grok's response audio is complete (PCM 24kHz mono s16le). */
  onAudioDone: (pcmBuffer: Buffer) => void | Promise<void>;
  /** Called on connection close or error. */
  onClose?: () => void;
}

export interface GrokVoiceAgentClient {
  sendAudio(chunk: Buffer): void;
  close(): void;
}

/**
 * Create a Grok Voice Agent client for one user session.
 * When conversation mode is on, stream Discord audio here instead of STT → Chat Completions → TTS.
 */
export function createGrokVoiceAgentClient(
  guildId: string,
  userId: string,
  callbacks: GrokVoiceAgentCallbacks
): GrokVoiceAgentClient | null {
  if (!GROK_ENABLED || !GROK_API_KEY) {
    log.info('Voice Agent skipped: Grok not configured (set GROK_API_KEY or XAI_API_KEY)');
    return null;
  }

  let ws: WebSocket | null = null;
  let sessionConfigured = false;
  let audioDeltas: string[] = [];
  let closed = false;

  function send(event: object): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(event));
    } catch (e) {
      log.warn(`Voice Agent send error: ${(e as Error).message}`);
    }
  }

  function doClose(): void {
    if (closed) return;
    closed = true;
    audioDeltas = [];
    if (ws) {
      try {
        ws.removeAllListeners();
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
    callbacks.onClose?.();
  }

  try {
    ws = new WebSocket(XAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    log.warn(`Voice Agent WebSocket create failed: ${(e as Error).message}`);
    return null;
  }

  ws.on('open', () => {
    if (closed) return;
    log.debug(`Voice Agent connected for ${guildId}:${userId}`);
    send({
      type: 'session.update',
      session: {
        voice: 'Ara',
        instructions: VOICE_AGENT_INSTRUCTIONS,
        turn_detection: { type: 'server_vad' },
        audio: {
          input: { format: { type: 'audio/pcm', rate: 24000 } },
          output: { format: { type: 'audio/pcm', rate: 24000 } },
        },
      },
    });
  });

  ws.on('message', (data: Buffer | string) => {
    if (closed) return;
    let event: { type?: string; delta?: string };
    try {
      event = JSON.parse(data.toString()) as { type?: string; delta?: string };
    } catch {
      return;
    }
    switch (event.type) {
      case 'session.updated':
        sessionConfigured = true;
        log.debug('Voice Agent session.updated');
        break;
      case 'response.output_audio.delta':
        if (typeof event.delta === 'string') {
          audioDeltas.push(event.delta);
        }
        break;
      case 'response.output_audio.done':
        if (audioDeltas.length > 0) {
          const b64 = audioDeltas.join('');
          audioDeltas = [];
          try {
            const pcm = Buffer.from(b64, 'base64');
            void Promise.resolve(callbacks.onAudioDone(pcm)).catch((e) => {
              log.warn(`Voice Agent onAudioDone error: ${(e as Error).message}`);
            });
          } catch (e) {
            log.warn(`Voice Agent decode audio failed: ${(e as Error).message}`);
          }
        }
        break;
      case 'response.done':
        break;
      case 'error':
        log.warn('Voice Agent server error:', event);
        break;
      default:
        break;
    }
  });

  ws.on('error', (err) => {
    log.warn(`Voice Agent WebSocket error: ${err.message}`);
    doClose();
  });

  ws.on('close', () => {
    doClose();
  });

  return {
    sendAudio(chunk: Buffer) {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN || !sessionConfigured) return;
      if (chunk.length <= 10) return;
      const resampled = resample48kStereoTo24kMono(chunk);
      const b64 = resampled.toString('base64');
      send({ type: 'input_audio_buffer.append', audio: b64 });
    },
    close() {
      doClose();
    },
  };
}
