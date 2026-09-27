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
   * Called on Discord's silence boundary. Commits the input buffer whenever
   * audio was appended since the last commit, then requests a response ONLY
   * if that audio's own transcript opened with the wake word.
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
  let utteranceSeq = 0;
  /**
   * The transcript xAI has sent for one utterance. INVARIANT: a decision reads
   * slot.text only when slot.seq equals the seq captured at run entry; every
   * write stamps slot.seq = utteranceSeq; a new utterance begins only when real
   * audio is appended after a commit. Nothing else clears the text — clearing it
   * separately is how an earlier revision dropped legitimate replies.
   */
  let slot = { seq: -1, text: '' };
  /** True between a commit and the next real audio chunk. */
  let utteranceClosed = true;
  // Whether audio has been appended since the last commit. Gates three things:
  // the commit itself (an empty-buffer commit is answered with a server `error`
  // event — pure log noise for a queued or duplicate boundary), the
  // `response.create` (a boundary with no speech of its own must never reply,
  // whatever the slot happens to hold), and the "no transcription event ever
  // arrived" diagnostic (a silent boundary is not evidence the gate is dead).
  let audioAppended = false;
  let endUtteranceChain: Promise<void> = Promise.resolve();
  // Diagnoses a dead wake-word feature: if xAI's transcription event name
  // differs from what we handle, the transcript never lands and the bot is
  // silently (safely) mute forever. Warn once per client, not once per
  // utterance, so a long-lived session doesn't spam the log.
  let hasReceivedTranscriptionEvent = false;
  let warnedNoTranscription = false;
  // Same warn-once discipline for a transcription event whose type none of the
  // cases handle (see the switch's default case).
  let warnedUnhandledTranscription = false;
  // Handle + resolver for the current settle-window wait, so doClose() can
  // force it to resolve immediately instead of leaving it (and every queued
  // endUtterance() behind it) waiting out the full TRANSCRIPT_SETTLE_MS after
  // the client is already gone. Only one is ever in flight at a time — the
  // endUtteranceChain serializes runs.
  let pendingSettleTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSettleResolve: (() => void) | null = null;

  function settleWait(): Promise<void> {
    return new Promise<void>((resolve) => {
      pendingSettleResolve = resolve;
      pendingSettleTimer = setTimeout(() => {
        pendingSettleTimer = null;
        pendingSettleResolve = null;
        resolve();
      }, TRANSCRIPT_SETTLE_MS);
    });
  }
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
    if (pendingSettleTimer) {
      clearTimeout(pendingSettleTimer);
      pendingSettleTimer = null;
    }
    if (pendingSettleResolve) {
      const resolve = pendingSettleResolve;
      pendingSettleResolve = null;
      resolve();
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
        // Arms nothing. The server acks session.updated again after every
        // reply (sendSessionUpdate() is re-sent on response.created and
        // response.done), and an ack says nothing about which utterance owns
        // the transcript slot — only utteranceSeq does. That is why the
        // re-arm question, which produced a fail-open path twice, no longer
        // exists here.
        sessionConfigured = true;
        log.debug('Voice Agent session.updated');
        break;
      case 'conversation.item.input_audio_transcription.updated':
      case 'conversation.item.input_audio_transcription.completed': {
        // The exact event name xAI emits is unverified against the docs; handle
        // both spellings. Both carry cumulative (not incremental) text, so we
        // replace rather than append. Every write stamps the slot with the
        // utterance that owns it right now — that stamp is the whole gate.
        hasReceivedTranscriptionEvent = true;
        const text = event.transcript ?? event.delta;
        if (typeof text === 'string' && text.length > 0) {
          slot = { seq: utteranceSeq, text };
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
        // A transcription event we deliberately do not handle — notably
        // conversation.item.input_audio_transcription.delta. An incremental
        // fragment cannot be stitched into the slot safely: if xAI split
        // "Evanescence is great" into ".delta Evan" + ".delta escence is
        // great" and the first fragment landed after the next utterance's
        // audio had rotated the sequence, "Evan" would become that
        // utterance's head and open the gate on a word nobody spoke. That is
        // the only way to INVENT a wake word rather than mis-attribute a real
        // one, and the event's shape is unverified. So if xAI really emits
        // only .delta the bot goes mute and this line says why: silence plus
        // a clear signal, never a guessed reconstruction. It must NOT set
        // hasReceivedTranscriptionEvent — a .delta-only API has to produce a
        // diagnostic, not silence with no explanation.
        if (
          typeof event.type === 'string' &&
          event.type.startsWith('conversation.item.input_audio_transcription.') &&
          !warnedUnhandledTranscription
        ) {
          warnedUnhandledTranscription = true;
          log.warn(
            `Voice Agent received unhandled transcription event ${event.type} for ${guildId}:${userId}; the wake-word gate cannot open on it`
          );
        }
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
      // Drop sub-11-byte noise BEFORE the new-utterance block: a noise chunk
      // must not rotate utterance identity, or it would orphan a transcript
      // already stamped for the utterance actually being spoken.
      if (chunk.length <= 10) return;
      // The ONE place a new utterance begins: real audio after a commit.
      // slot.text is deliberately not cleared — every read is seq-gated, so
      // clearing buys nothing, and clearing it here is exactly what dropped
      // genuine replies in an earlier revision.
      if (utteranceClosed) {
        utteranceClosed = false;
        utteranceSeq += 1;
      }
      audioAppended = true;
      const resampled = resample48kStereoTo24kMono(chunk);
      const b64 = resampled.toString('base64');
      send({ type: 'input_audio_buffer.append', audio: b64 });
    },
    // Not async: this only assigns into the serialization chain and returns
    // it. Note that N boundaries queued behind one another make the caller
    // of the last one wait N × TRANSCRIPT_SETTLE_MS, since each run() fully
    // completes (including its settle wait) before the next begins.
    endUtterance() {
      const run = async () => {
        if (closed || !ws || ws.readyState !== WebSocket.OPEN || !sessionConfigured) return;
        // Capture this utterance's identity and whether it had any audio
        // before anything below can change out from under it.
        const seq = utteranceSeq;
        const hadAudio = audioAppended;
        // The commit is never gated on the TRANSCRIPT — if the server only
        // transcribes committed audio, that would deadlock, and a commit
        // produces no reply on its own. It is gated on audio having been
        // appended since the last commit: committing an empty buffer earns an
        // `error` event from the server and nothing else.
        if (hadAudio) {
          send({ type: 'input_audio_buffer.commit' });
          // Reset immediately: the appended audio is spent, so a queued or
          // duplicate boundary behind this one has nothing of its own to
          // commit (and nothing of its own to reply about).
          audioAppended = false;
        }
        // From here on the utterance is closed; only the next real audio chunk
        // (sendAudio) starts a new one and rotates utteranceSeq.
        utteranceClosed = true;
        // Unconditional: a cumulative partial that happens to already match
        // (e.g. "Evan" mid-word on "Evanescence") must not short-circuit the
        // wait for the final text.
        await settleWait();
        if (closed) return;
        // THE INVARIANT: read the slot only when it is stamped for THIS
        // utterance. A later utterance may already own it and be writing its
        // own words — that text is not ours, so treat it as silence.
        const text = slot.seq === seq ? slot.text : '';
        if (hadAudio && !hasReceivedTranscriptionEvent && !warnedNoTranscription) {
          warnedNoTranscription = true;
          log.warn(
            `Voice Agent received no transcription event (model=${INPUT_TRANSCRIPTION_MODEL}) for ${guildId}:${userId}; the wake-word gate can never open`
          );
        }
        if (hadAudio && isAddressed(text, VOICE_TRIGGER_WORD)) {
          send({ type: 'response.create' });
        } else {
          log.debug(
            `Utterance not addressed for ${guildId}:${userId} (transcript ${text.length} chars); staying silent`
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
