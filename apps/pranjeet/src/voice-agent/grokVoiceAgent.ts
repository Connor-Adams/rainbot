/**
 * xAI Voice Agent API client (real-time voice with Grok).
 * @see https://docs.x.ai/developers/model-capabilities/audio/voice-agent
 * @see https://docs.x.ai/developers/model-capabilities/audio/voice-agent#message-types (client/server events)
 *
 * Connects via WebSocket to wss://api.x.ai/v1/realtime, streams Discord
 * audio (resampled to 24kHz mono), receives Grok's voice response and plays it.
 */
import WebSocket from 'ws';
import { createLogger } from '@rainbot/shared';
import { resample48kStereoTo24kMono } from '../audio/utils';
import { getGrokPersona, getGrokVoice } from '../redis';
import {
  GROK_API_KEY,
  GROK_ENABLED,
  GROK_VOICE,
  GROK_VOICE_AGENT_TOOLS,
  VOICE_TRIGGER_WORD,
} from '../config';
import { getVoiceAgentInstructions } from '../prompts';
import { VOICE_AGENT_MUSIC_TOOLS } from './tools';

const log = createLogger('GROK_VOICE_AGENT');
const XAI_REALTIME_URL = 'wss://api.x.ai/v1/realtime';
/**
 * ws-level heartbeat. A half-open TCP connection (peer/network dies without a
 * close frame) never fires 'close'/'error', so readyState stays OPEN and the
 * client zombies — sendAudio() writes into the void, no onClose eviction. We
 * ping every PING_INTERVAL_MS; if no pong arrives before the next tick the
 * client is considered dead and doClose() runs (triggers the manager eviction
 * wired in apps/pranjeet/src/index.ts). Worst-case detection ~2x interval.
 */
const PING_INTERVAL_MS = 15_000;

/**
 * Asking xAI to transcribe the USER's input is what makes the wake word free:
 * the transcript arrives on the socket we already hold, so no whisper roundtrip
 * and no second API bill. Emitted as conversation.item.input_audio_transcription.updated.
 */
export const INPUT_TRANSCRIPTION_MODEL = 'grok-transcribe';

/**
 * The input transcript is cumulative and may trail Discord's silence event. Wait
 * this long for a late update before deciding whether we were addressed.
 */
export const TRANSCRIPT_SETTLE_MS = 300;

/**
 * True when the utterance opens with the wake word. Leading punctuation and
 * quotes are stripped, matching is case-insensitive, and the word must be
 * followed by a boundary so "evanescence" does not wake it. An empty trigger
 * word returns false — the gate fails closed rather than answering everything.
 */
export function isAddressed(transcript: string, triggerWord: string): boolean {
  const trigger = triggerWord.trim().toLowerCase();
  if (trigger.length === 0) return false;
  const cleaned = transcript
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
  if (!cleaned.startsWith(trigger)) return false;
  const next = cleaned.charAt(trigger.length);
  return next === '' || !/[\p{L}\p{N}]/u.test(next);
}

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
  /**
   * Called on Discord's silence boundary. Always commits the input buffer, then
   * requests a response ONLY if the wake word opened the utterance.
   */
  endUtterance(): Promise<void>;
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
  let audioDeltas: Buffer[] = [];
  let closed = false;
  let isAlive = true;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let _currentResponseId: string | null = null;
  let inputTranscript = '';
  // Owns the transcript slot for exactly one utterance at a time. Armed when
  // the session becomes usable and re-armed by new audio; disarmed once an
  // utterance's endUtterance() has captured its decision. While disarmed,
  // incoming transcription events are dropped instead of being inherited by
  // whichever utterance opens next (this is what closes the late-transcript
  // bug: a stale transcript arriving after the decision is made must not be
  // read by a later, unrelated utterance).
  let acceptingTranscript = false;
  // Serializes endUtterance() calls so overlapping boundaries (e.g. two
  // Discord speaking streams closing close together) can't both observe the
  // same transcript slot and both reply. Chained with .then(run, run) so one
  // rejected run cannot wedge every later utterance.
  let endUtteranceChain: Promise<void> = Promise.resolve();
  // Diagnoses a dead wake-word feature: if xAI's transcription event name
  // differs from what we handle, the transcript never lands and the bot is
  // silently (safely) mute forever. Warn once per client, not once per
  // utterance, so a long-lived session doesn't spam the log.
  let hasReceivedTranscriptionEvent = false;
  let warnedNoTranscription = false;
  let sessionConfig: {
    instructions: string;
    voice: string;
    // null, not server_vad: xAI must not auto-respond. We own turns —
    // input_audio_buffer.commit + response.create, gated on the wake word.
    turn_detection: null;
    audio: {
      input: {
        format: { type: 'audio/pcm'; rate: number };
        transcription: { model: string };
      };
      output: { format: { type: 'audio/pcm'; rate: number } };
    };
    tools?: typeof VOICE_AGENT_MUSIC_TOOLS;
  } | null = null;

  function send(event: object): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(event));
    } catch (e) {
      log.warn(`Voice Agent send error: ${(e as Error).message}`);
    }
  }

  async function sendSessionUpdate(): Promise<void> {
    if (!sessionConfig) return;
    // Check Redis for voice preference changes before each update
    try {
      const userVoice = await getGrokVoice(guildId, userId);
      const newVoice = userVoice || GROK_VOICE;
      if (newVoice !== sessionConfig.voice) {
        sessionConfig.voice = newVoice;
        log.debug(`Voice Agent voice updated to: ${newVoice}`);
      }
    } catch (e) {
      log.debug(`Voice Agent failed to check voice preference: ${(e as Error).message}`);
      // Continue with current voice if Redis check fails
    }
    send({ type: 'session.update', session: sessionConfig });
  }

  function doClose(): void {
    if (closed) return;
    closed = true;
    audioDeltas = [];
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
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
    // Start ws-level heartbeat to detect half-open connections (see PING_INTERVAL_MS).
    isAlive = true;
    heartbeat = setInterval(() => {
      if (closed || !ws) return;
      if (!isAlive) {
        log.warn(
          `Voice Agent no pong within ${PING_INTERVAL_MS}ms for ${guildId}:${userId}; closing zombie connection`
        );
        doClose();
        return;
      }
      isAlive = false;
      try {
        ws.ping();
      } catch (e) {
        log.warn(`Voice Agent ping failed: ${(e as Error).message}`);
        doClose();
      }
    }, PING_INTERVAL_MS);
    const toolsEnabled = GROK_VOICE_AGENT_TOOLS && !!callbacks.executeCommand;
    const tools = toolsEnabled ? VOICE_AGENT_MUSIC_TOOLS : [];
    void (async () => {
      if (closed) return;
      const personaId = await getGrokPersona(guildId, userId);
      const instructions = await getVoiceAgentInstructions(
        personaId ?? undefined,
        tools.length > 0
      );
      if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (!instructions || instructions.length === 0) {
        log.warn('Voice Agent session.instructions would be empty; skipping session.update');
        doClose();
        return;
      }
      const session = {
        instructions,
        voice: GROK_VOICE,
        turn_detection: null,
        audio: {
          input: {
            format: { type: 'audio/pcm' as const, rate: 24000 },
            transcription: { model: INPUT_TRANSCRIPTION_MODEL },
          },
          output: { format: { type: 'audio/pcm' as const, rate: 24000 } },
        },
        ...(tools.length > 0 ? { tools } : {}),
      };
      sessionConfig = session;
      log.debug(
        `Voice Agent session.update instructions=${instructions.length} chars tools=${tools.length}`
      );
      void sendSessionUpdate();
    })();
  });

  ws.on('message', async (data: Buffer | string) => {
    if (closed) return;
    let event: {
      type?: string;
      delta?: string;
      transcript?: string;
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
        // A client is armed from the moment it becomes usable, not just from
        // the next audio chunk — this utterance's transcript is fair game.
        acceptingTranscript = true;
        log.debug('Voice Agent session.updated');
        break;
      case 'conversation.item.input_audio_transcription.updated':
      case 'conversation.item.input_audio_transcription.completed': {
        // The exact event name xAI emits is unverified against the docs; handle
        // both spellings. Both carry cumulative (not incremental) text, so we
        // replace rather than append.
        hasReceivedTranscriptionEvent = true;
        const text = event.transcript ?? event.delta;
        if (acceptingTranscript && typeof text === 'string' && text.length > 0) {
          inputTranscript = text;
        }
        break;
      }
      case 'conversation.item.input_audio_transcription.delta': {
        // Unlike .updated/.completed, a .delta carries an incremental fragment
        // — appending (not replacing) is what keeps the wake word at the head
        // of the utterance from being overwritten by a later fragment.
        hasReceivedTranscriptionEvent = true;
        const text = event.transcript ?? event.delta;
        if (acceptingTranscript && typeof text === 'string' && text.length > 0) {
          inputTranscript += text;
        }
        break;
      }
      case 'response.created':
        if (event.response?.id) {
          _currentResponseId = event.response.id;
        }
        // Reinforce session (incl. accent instructions) right before model speaks
        void sendSessionUpdate();
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
          // Decode each delta independently. xAI base64-encodes every delta on
          // its own, so joining the base64 strings and decoding once corrupts
          // audio: a non-final delta whose byte length isn't a multiple of 3
          // ends in '=' padding, and Node's base64 decoder halts at the first
          // embedded '=', silently truncating later deltas → garbled output.
          audioDeltas.push(Buffer.from(event.delta, 'base64'));
        }
        break;
      case 'response.output_audio.done':
        if (audioDeltas.length > 0) {
          const pcm = Buffer.concat(audioDeltas);
          audioDeltas = [];
          void Promise.resolve(callbacks.onAudioDone(pcm)).catch((e) => {
            log.warn(`Voice Agent onAudioDone error: ${(e as Error).message}`);
          });
        }
        break;
      case 'response.done':
        _currentResponseId = null;
        // Re-send session.update after each turn to reinforce persona/accent
        // This also checks Redis for voice preference changes
        void sendSessionUpdate();
        break;
      case 'error':
        log.warn('Voice Agent server error:', event);
        break;
      default:
        break;
    }
  });

  ws.on('pong', () => {
    isAlive = true;
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
      // Re-arm only when disarmed, so mid-utterance chunks don't wipe
      // accumulated transcript text — this is what lets a fresh utterance
      // start accepting transcripts again after the previous one decided.
      if (!acceptingTranscript) {
        acceptingTranscript = true;
        inputTranscript = '';
      }
      if (chunk.length <= 10) return;
      const resampled = resample48kStereoTo24kMono(chunk);
      const b64 = resampled.toString('base64');
      send({ type: 'input_audio_buffer.append', audio: b64 });
    },
    async endUtterance() {
      const run = async () => {
        if (closed || !ws || ws.readyState !== WebSocket.OPEN || !sessionConfigured) return;
        // Commit unconditionally. If the server only transcribes committed audio,
        // gating the commit on the transcript would deadlock; commit merely closes
        // the input buffer and produces no reply on its own.
        send({ type: 'input_audio_buffer.commit' });
        // Unconditional: a cumulative partial that happens to already match
        // (e.g. "Evan" mid-word on "Evanescence") must not short-circuit the
        // wait for the final text.
        await new Promise((r) => setTimeout(r, TRANSCRIPT_SETTLE_MS));
        const transcript = inputTranscript;
        // Disarm AFTER the settle window: a transcript arriving inside the
        // window still counts for this utterance; anything later is dropped
        // until new audio re-arms (sendAudio) for the next one.
        acceptingTranscript = false;
        inputTranscript = '';
        if (!hasReceivedTranscriptionEvent && !warnedNoTranscription) {
          warnedNoTranscription = true;
          log.warn(
            `Voice Agent received no transcription event (model=${INPUT_TRANSCRIPTION_MODEL}) for ${guildId}:${userId}; the wake-word gate can never open`
          );
        }
        if (isAddressed(transcript, VOICE_TRIGGER_WORD)) {
          send({ type: 'response.create' });
        } else {
          log.debug(
            `Utterance not addressed for ${guildId}:${userId} (transcript ${transcript.length} chars); staying silent`
          );
        }
      };
      endUtteranceChain = endUtteranceChain.then(run, run);
      return endUtteranceChain;
    },
    close() {
      doClose();
    },
  };
}
