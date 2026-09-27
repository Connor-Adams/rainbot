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
  VOICE_TRANSCRIPT_SETTLE_MS,
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
 * CEILING (not a fixed delay) on the wait for xAI's input transcript after the
 * audio buffer is committed. The wait resolves as soon as a transcription event
 * for the deciding utterance lands, so this value is only ever paid in full when
 * no transcript arrives at all — which is why it can afford to be generous.
 *
 * It must be generous: this API family (whose event names it mirrors) may emit
 * input transcription on commit-completion rather than during speech, i.e.
 * hundreds of milliseconds to seconds AFTER Discord's silence boundary. A tight
 * ceiling decided before the transcript existed, dropped it, and left the bot
 * permanently mute with a "no transcription event" warning that was not true.
 *
 * Tunable via VOICE_TRANSCRIPT_SETTLE_MS (see apps/pranjeet/src/config.ts). The
 * name is kept for the tests that import it.
 */
export const TRANSCRIPT_SETTLE_MS = VOICE_TRANSCRIPT_SETTLE_MS;

/**
 * Quiet period a cumulative PARTIAL transcript buys before the gate decides.
 *
 * Only the `.completed` event is terminal, so a partial must NEVER end the wait:
 * deciding on `.updated "Evan"` replies to "Evanescence is a great band", and
 * deciding on `.updated "Hey"` makes the multi-word trigger "hey bot" unmatchable
 * against any streaming transcriber. But this file's own comment says
 * `grok-transcribe` may emit `.updated` ONLY, and an `.updated`-only API that
 * fell back to the raw ceiling would pay TRANSCRIPT_SETTLE_MS on every turn.
 *
 * So a partial instead restarts a short timer: the decision happens this long
 * after the LAST partial, i.e. once the text has stopped growing. The restart is
 * always clamped to the absolute TRANSCRIPT_SETTLE_MS deadline measured from when
 * the wait began, so a continuous stream of partials cannot defer a reply forever.
 */
const PARTIAL_SETTLE_DEBOUNCE_MS = 250;

/**
 * Collapse every run of non-alphanumerics to a single space, lowercase, trim.
 * Applied to BOTH sides of the comparison so a multi-word trigger survives the
 * punctuation a transcriber sprinkles between its words: trigger "hey bot" has
 * to match "Hey, bot, play music". Stripping only LEADING punctuation (the
 * earlier behaviour) made every multi-word trigger unmatchable, including the
 * "hey bot" example the docs advertise.
 */
function normalizeForTrigger(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * True when the utterance opens with the wake word. Punctuation runs collapse to
 * single spaces on both sides, matching is case-insensitive, and the trigger must
 * be followed by a boundary so "evanescence" does not wake it. An empty trigger
 * word returns false — the gate fails closed rather than answering everything.
 */
export function isAddressed(transcript: string, triggerWord: string): boolean {
  const trigger = normalizeForTrigger(triggerWord);
  if (trigger.length === 0) return false;
  const cleaned = normalizeForTrigger(transcript);
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
  // INVARIANT: utteranceClosed and audioAppended are two views of one predicate:
  // reachable states are (closed=true, appended=false) or (closed=false, appended=true),
  // because sendAudio writes both synchronously and endUtterance reads both without await.
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
  // Every distinct event.type that fell through to the default case. Included in
  // the no-transcription warning: if xAI's transcription event name differs from
  // ours EARLIER than the prefix we pattern-match on, the prefix check below says
  // nothing, and this set is then the only record of what the socket actually
  // sent. Bounded so a chatty socket cannot grow it without limit.
  const unhandledEventTypes = new Set<string>();
  const UNHANDLED_EVENT_TYPES_CAP = 20;
  // The last utterance whose reply decision has already run, and when. A
  // transcription event stamped for that utterance arrived TOO LATE to be read —
  // the third diagnostic (below) reports the measured lag so an operator can
  // raise the ceiling instead of guessing.
  let decidedSeq: number | null = null;
  let decidedAt = 0;
  // Whether that decision actually READ a transcript. Without this the
  // diagnostic fires on the ordinary happy path — the second event of a normal
  // `updated → completed` turn, or a trailing `.updated` after `.completed`, is
  // stamped for an utterance that has already decided — and burns its warn-once
  // latch on turn one, so the genuinely-too-low ceiling it exists to report
  // can never announce itself. A decision that read text was not starved.
  let decidedWithText = false;
  let warnedLateTranscription = false;
  // Handle + resolver for the current settle-window wait, so doClose() can
  // force it to resolve immediately instead of leaving it (and every queued
  // endUtterance() behind it) waiting out the full TRANSCRIPT_SETTLE_MS after
  // the client is already gone. Only one is ever in flight at a time — the
  // endUtteranceChain serializes runs. pendingSettleSeq is the utterance the
  // in-flight wait is deciding for: a transcription event stamped for exactly
  // that seq resolves the wait immediately (see settleWait).
  let pendingSettleTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSettleResolve: (() => void) | null = null;
  let pendingSettleSeq: number | null = null;
  // Absolute deadline (epoch ms) for the in-flight wait, fixed when it began.
  // extendSettleIfWaitingFor may only ever shorten a timer against this — it is
  // what stops an unbroken stream of partials from deferring the reply forever.
  let pendingSettleDeadline = 0;

  /**
   * Wait for this utterance's FINAL transcript, resolving on WHICHEVER COMES FIRST:
   * a terminal transcription event for `seq` (the common case — the transcription
   * handler calls resolveSettleIfWaitingFor), the partial debounce going quiet
   * (extendSettleIfWaitingFor), or TRANSCRIPT_SETTLE_MS elapsing.
   * A bare timer was the bug: a transcript delivered after the timer fired was
   * stamped for an utterance that had already decided, then discarded by the
   * next utterance's seq bump — one missed transcript and the gate never opened
   * again. Racing the two is also what lets the ceiling be generous: the wait
   * ends the instant the answer is available.
   */
  function settleWait(seq: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        // Idempotent: the ceiling timer, the debounce timer, a terminal event and
        // doClose() can all reach for the same wait.
        if (done) return;
        done = true;
        if (pendingSettleTimer) {
          clearTimeout(pendingSettleTimer);
          pendingSettleTimer = null;
        }
        pendingSettleResolve = null;
        pendingSettleSeq = null;
        resolve();
      };
      pendingSettleSeq = seq;
      pendingSettleResolve = finish;
      pendingSettleDeadline = Date.now() + TRANSCRIPT_SETTLE_MS;
      pendingSettleTimer = setTimeout(finish, TRANSCRIPT_SETTLE_MS);
    });
  }

  /**
   * Called when a TERMINAL transcript lands; ends the settle wait it belongs to.
   * Never call this for a partial — the whole point of the wait is that the gate
   * decides on the final text, not on a prefix of it.
   */
  function resolveSettleIfWaitingFor(seq: number): void {
    if (pendingSettleResolve && pendingSettleSeq === seq) {
      pendingSettleResolve();
    }
  }

  /**
   * Called when a cumulative PARTIAL transcript lands: restart the wait's timer
   * for `debounceMs`, so the decision happens shortly after the text stops
   * growing rather than at the full ceiling — but never LATER than the absolute
   * TRANSCRIPT_SETTLE_MS deadline the wait started with.
   */
  function extendSettleIfWaitingFor(seq: number, debounceMs: number): void {
    if (!pendingSettleResolve || pendingSettleSeq !== seq) return;
    const finish = pendingSettleResolve;
    const remaining = pendingSettleDeadline - Date.now();
    if (remaining <= 0) {
      // The ceiling is already up; decide now rather than granting an extension
      // past it (its own timer is due, but this keeps the clamp unconditional).
      finish();
      return;
    }
    if (pendingSettleTimer) {
      clearTimeout(pendingSettleTimer);
    }
    pendingSettleTimer = setTimeout(finish, Math.min(debounceMs, remaining));
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
      pendingSettleSeq = null;
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
          // Wake the settle window for the utterance still deciding, so the
          // common case costs the transcript's real latency, not the ceiling —
          // but ONLY the terminal event may end that wait. `.updated` carries a
          // cumulative PARTIAL, and deciding on one is a fail-open: "Evan" is a
          // prefix of "Evanescence is a great band". A partial instead debounces
          // the wait (still clamped to TRANSCRIPT_SETTLE_MS), which keeps latency
          // low for an `.updated`-only API without deciding on truncated text.
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            resolveSettleIfWaitingFor(utteranceSeq);
          } else {
            extendSettleIfWaitingFor(utteranceSeq, PARTIAL_SETTLE_DEBOUNCE_MS);
          }
          // Too late: this utterance's decision already ran AND it read nothing,
          // so a transcript existed that the gate could not see. Report the
          // measured lag and the knob that fixes it — without this, a ceiling set
          // too low looks exactly like "xAI sent no transcript at all", which is
          // the wrong thing to go debug. A decision that DID read text was not
          // starved (a trailing event on a turn that already replied is normal),
          // and must not burn the warn-once latch this diagnostic depends on.
          if (utteranceSeq === decidedSeq && !decidedWithText && !warnedLateTranscription) {
            warnedLateTranscription = true;
            log.warn(
              `Voice Agent transcription for ${guildId}:${userId} arrived ${Date.now() - decidedAt}ms after its reply decision (settle ceiling ${TRANSCRIPT_SETTLE_MS}ms); the wake-word gate could not read it — raise VOICE_TRANSCRIPT_SETTLE_MS`
            );
          }
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
          unhandledEventTypes.size < UNHANDLED_EVENT_TYPES_CAP
        ) {
          unhandledEventTypes.add(event.type);
        }
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
    // Returns the promise for this boundary's place in the chain. Queued
    // boundaries wait sequentially; each run() fully completes before the next.
    endUtterance() {
      const run = async () => {
        if (closed || !ws || ws.readyState !== WebSocket.OPEN || !sessionConfigured) return;
        // Capture this utterance's identity and whether it had any audio
        // before anything below can change out from under it.
        const seq = utteranceSeq;
        const hadAudio = audioAppended;
        // Commit only if audio was appended. An empty commit earns a server error.
        if (hadAudio) {
          send({ type: 'input_audio_buffer.commit' });
          audioAppended = false;
        }
        utteranceClosed = true;
        // Wait for the final transcript, even if a cumulative partial already
        // matches the wake word — but only until it lands (settleWait races the
        // ceiling against the TERMINAL transcript for this seq, and treats a
        // partial as a reason to wait a little longer, never to decide).
        await settleWait(seq);
        if (closed) return;
        // This utterance is about to decide; from here on a transcript for it is
        // too late, and the late-transcription diagnostic can measure by how much.
        // Only an utterance that actually carried audio can be owed a transcript,
        // so a silent boundary must not restamp the clock a late one is measured
        // against (that would understate the reported lag).
        // Read the slot only if it belongs to this utterance (stamped by seq).
        const text = slot.seq === seq ? slot.text : '';
        if (hadAudio) {
          decidedSeq = seq;
          decidedAt = Date.now();
          // Whether the gate had anything to read. Only a starved decision makes
          // a later transcript for this seq evidence of a too-low ceiling.
          decidedWithText = text.length > 0;
        }
        if (hadAudio && !hasReceivedTranscriptionEvent && !warnedNoTranscription) {
          warnedNoTranscription = true;
          const seen =
            unhandledEventTypes.size > 0 ? [...unhandledEventTypes].join(', ') : '(none)';
          log.warn(
            `Voice Agent received no transcription event (model=${INPUT_TRANSCRIPTION_MODEL}) for ${guildId}:${userId}; the wake-word gate can never open. Unhandled event types seen on this socket: ${seen}`
          );
        }
        if (hadAudio && isAddressed(text, VOICE_TRIGGER_WORD)) {
          // A transcript stamped to a later utterance (because it arrived after
          // that utterance's audio bumped the sequence) is answered late, but
          // the user really did say the wake word — the delay is the cost of
          // the settle window, not a false positive.
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
