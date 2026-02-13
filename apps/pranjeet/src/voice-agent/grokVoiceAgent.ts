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
import { GROK_SYSTEM_PROMPT } from '../chat/grok';
import { getGrokVoice } from '../redis';
import { GROK_API_KEY, GROK_ENABLED, GROK_VOICE, GROK_VOICE_AGENT_TOOLS } from '../config';

const log = createLogger('GROK_VOICE_AGENT');
const XAI_REALTIME_URL = 'wss://api.x.ai/v1/realtime';

export interface GrokVoiceAgentCallbacks {
  /** Called when Grok's response audio is complete (PCM 24kHz mono s16le). */
  onAudioDone: (pcmBuffer: Buffer) => void | Promise<void>;
  /** Called on connection close or error. */
  onClose?: () => void;
  /** Execute a music command and return the result. */
  executeCommand?: (command: string, args: Record<string, unknown>) => Promise<string>;
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
  let currentResponseId: string | null = null;

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
    // Send session.update synchronously so instructions apply before conversation starts.
    // Voice preference is fetched async; we send a follow-up session.update when it resolves.
    const tools =
      GROK_VOICE_AGENT_TOOLS && callbacks.executeCommand
        ? [
            {
              type: 'function',
              name: 'play_music',
              description:
                'Play music or add to queue. Use this when the user wants to play a song, artist, or playlist.',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description:
                      'Song name, artist name, YouTube URL, Spotify URL, or search query',
                  },
                },
                required: ['query'],
              },
            },
            {
              type: 'function',
              name: 'skip_song',
              description:
                'Skip the current song or multiple songs. Use when user says skip, next, skip song, etc.',
              parameters: {
                type: 'object',
                properties: {
                  count: {
                    type: 'number',
                    description: 'Number of songs to skip (default: 1)',
                  },
                },
                required: [],
              },
            },
            {
              type: 'function',
              name: 'pause_music',
              description:
                'Pause the currently playing music. Use when user says pause, stop playing, hold on, etc.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            {
              type: 'function',
              name: 'resume_music',
              description:
                'Resume paused music. Use when user says resume, continue, unpause, keep going, etc.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            {
              type: 'function',
              name: 'stop_music',
              description:
                'Stop playback and clear the queue. Use when user says stop, stop music, clear queue, etc.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
            {
              type: 'function',
              name: 'set_volume',
              description: 'Set the playback volume. Use when user wants to change volume.',
              parameters: {
                type: 'object',
                properties: {
                  volume: {
                    type: 'number',
                    description: 'Volume level from 0 to 100',
                  },
                },
                required: ['volume'],
              },
            },
            {
              type: 'function',
              name: 'clear_queue',
              description:
                'Clear the music queue. Use when user says clear queue, clear, empty queue, etc.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          ]
        : [];
    const instructions =
      tools.length > 0
        ? `${GROK_SYSTEM_PROMPT}

CRITICAL: Stay in character at all times. When you execute music commands (play, skip, pause, etc.), respond to the user in your persona—do not become a generic helpful assistant. Announce what you did in character.`
        : GROK_SYSTEM_PROMPT;
    // xAI docs: instructions (system prompt) first in session object
    const session = {
      instructions,
      voice: GROK_VOICE,
      turn_detection: { type: 'server_vad' as const },
      audio: {
        input: { format: { type: 'audio/pcm' as const, rate: 24000 } },
        output: { format: { type: 'audio/pcm' as const, rate: 24000 } },
      },
      ...(tools.length > 0 ? { tools } : {}),
    };
    log.debug(`Voice Agent session.update instructions=${instructions.length} chars`);
    send({ type: 'session.update', session });
    // Update voice when Redis returns user preference
    getGrokVoice(guildId, userId).then((userVoice) => {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;
      const v = userVoice || GROK_VOICE;
      if (v !== GROK_VOICE) {
        send({ type: 'session.update', session: { ...session, voice: v } });
      }
    });
  });

  ws.on('message', async (data: Buffer | string) => {
    if (closed) return;
    let event: {
      type?: string;
      delta?: string;
      response?: { id?: string };
      name?: string;
      call_id?: string;
      arguments?: string;
    };
    try {
      event = JSON.parse(data.toString()) as typeof event;
    } catch {
      return;
    }
    switch (event.type) {
      case 'session.updated':
        sessionConfigured = true;
        log.debug('Voice Agent session.updated');
        break;
      case 'response.created':
        if (event.response?.id) {
          currentResponseId = event.response.id;
        }
        break;
      case 'response.function_call_arguments.done':
        if (!callbacks.executeCommand || !event.name || !event.call_id || !event.arguments) {
          log.warn('Function call received but executeCommand not provided or missing fields');
          break;
        }
        try {
          const args = JSON.parse(event.arguments) as Record<string, unknown> | undefined;
          log.info(`Executing function: ${event.name} with args:`, args ?? {});
          const result = await callbacks.executeCommand(
            event.name,
            (args as Record<string, unknown>) ?? {}
          );
          // Send function result back to Grok
          send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: event.call_id,
              output: JSON.stringify({ success: true, result }),
            },
          });
          // Request Grok to continue with the result
          send({ type: 'response.create' });
        } catch (error) {
          const errorMsg = (error as Error).message || 'Unknown error';
          log.error(`Error executing function ${event.name}: ${errorMsg}`);
          send({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: event.call_id!,
              output: JSON.stringify({ success: false, error: errorMsg }),
            },
          });
          send({ type: 'response.create' });
        }
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
        currentResponseId = null;
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
