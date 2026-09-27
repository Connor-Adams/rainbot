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
 * audio buffer is committed. A TERMINAL transcription event for the deciding
 * utterance ends the wait immediately; a cumulative PARTIAL only shortens it to
 * PARTIAL_SETTLE_DEBOUNCE_MS (see below), and text already in the slot when the
 * wait begins shortens it the same way. So this value is only ever paid in full
 * when no transcript arrives at all — which is why it can afford to be generous.
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
 *
 * ONE partial buys no shortcut: one whose whole text IS exactly the trigger word
 * (see isExactlyTriggerWord and the transcription handler). Deliberately NOT
 * env-tunable — the ceiling is the operator-facing knob; this is the shape of the
 * gate. Documented for operators in .env.example under VOICE_TRANSCRIPT_SETTLE_MS.
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

/**
 * True when the whole cumulative partial SO FAR is exactly the wake word, i.e.
 * the trigger is the entire transcript and one more character could still glue
 * it into a longer word ("Evan" → "Evanescence"). Same normalisation as
 * isAddressed, so "Evan,", " evan " and "EVAN" all count.
 */
function isExactlyTriggerWord(text: string, triggerWord: string): boolean {
  const trigger = normalizeForTrigger(triggerWord);
  if (trigger.length === 0) return false;
  return normalizeForTrigger(text) === trigger;
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
  // The NORMALISED text that decision actually used. The diagnostic fires when a
  // later transcript for the same utterance DIFFERS from it — i.e. the gate
  // decided on text that was not the final text, which is precisely the
  // too-low-ceiling case this exists to report, including a decision made by the
  // partial debounce on truncated text ("Ev" → "Evan, skip this song").
  // Comparing on the normalised form keeps it quiet for a punctuation-only
  // straggler ("Evan, skip this song" → "Evan, skip this song."), the ordinary
  // second event of a normal turn, which must not burn the warn-once latch.
  // An earlier revision asked only whether the decision read ANY text, which
  // stayed silent for exactly the starved decision it was meant to catch.
  let decidedText = '';
  let warnedLateTranscription = false;
  /**
   * The ONE settle-window wait in flight, or null. Held as a single record — not
   * as parallel `timer`/`resolve`/`seq`/`deadline` variables — so that "these
   * four describe the same wait" is structural rather than a convention every
   * future edit has to remember. `seq` is the utterance the wait is deciding
   * for: a transcription event stamped for exactly that seq can end it
   * (terminal) or shorten it (partial). `deadline` is the absolute epoch-ms
   * ceiling fixed when the wait began; extendSettleIfWaitingFor may only ever
   * shorten a timer against it, which is what stops an unbroken stream of
   * partials from deferring the reply forever. Exactly one wait exists at a time
   * because endUtteranceChain serializes runs — do not relax that
   * serialization. doClose() resolves the record so the client shutting down
   * does not leave this wait (and every endUtterance() queued behind it) sitting
   * out the full TRANSCRIPT_SETTLE_MS.
   */
  let pendingSettle: {
    resolve: () => void;
    seq: number;
    deadline: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  /**
   * Wait for this utterance's FINAL transcript, resolving on WHICHEVER COMES FIRST:
   * a terminal transcription event for `seq` (the common case — the transcription
   * handler calls resolveSettleIfWaitingFor), the partial debounce going quiet
   * (extendSettleIfWaitingFor), or TRANSCRIPT_SETTLE_MS elapsing. A transcript
   * that had ALREADY landed for `seq` before this wait began starts the timer at
   * the debounce rather than the ceiling, for the same reason a partial does.
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
        if (pendingSettle?.timer) {
          clearTimeout(pendingSettle.timer);
        }
        pendingSettle = null;
        resolve();
      };
      // A transcript that landed BEFORE this boundary found no wait in flight, so
      // resolveSettleIfWaitingFor/extendSettleIfWaitingFor no-opped for it; a wait
      // that then started at the raw ceiling would burn the whole of
      // TRANSCRIPT_SETTLE_MS on a turn whose answer was already sitting in the
      // slot (+2s on EVERY reply at the production default, if `grok-transcribe`
      // streams during speech as its `.updated` naming implies). Treat it exactly
      // as a partial that has just arrived: wait only the debounce for a revision.
      // The exact-trigger guard still takes precedence — text that IS the whole
      // trigger word gets the full ceiling, because one more character could turn
      // "Evan" into "Evanescence".
      const alreadyHaveText = slot.seq === seq && slot.text.length > 0;
      const initialWait =
        alreadyHaveText && !isExactlyTriggerWord(slot.text, VOICE_TRIGGER_WORD)
          ? Math.min(PARTIAL_SETTLE_DEBOUNCE_MS, TRANSCRIPT_SETTLE_MS)
          : TRANSCRIPT_SETTLE_MS;
      pendingSettle = {
        resolve: finish,
        seq,
        deadline: Date.now() + TRANSCRIPT_SETTLE_MS,
        timer: setTimeout(finish, initialWait),
      };
    });
  }

  /**
   * Called when a TERMINAL transcript lands; ends the settle wait it belongs to.
   * Never call this for a partial — the whole point of the wait is that the gate
   * decides on the final text, not on a prefix of it.
   */
  function resolveSettleIfWaitingFor(seq: number): void {
    if (pendingSettle && pendingSettle.seq === seq) {
      pendingSettle.resolve();
    }
  }

  /**
   * Called when a cumulative PARTIAL transcript lands: restart the wait's timer
   * for `debounceMs`, so the decision happens shortly after the text stops
   * growing rather than at the full ceiling — but never LATER than the absolute
   * TRANSCRIPT_SETTLE_MS deadline the wait started with.
   */
  function extendSettleIfWaitingFor(seq: number, debounceMs: number): void {
    const wait = pendingSettle;
    if (!wait || wait.seq !== seq) return;
    const remaining = wait.deadline - Date.now();
    if (remaining <= 0) {
      // The ceiling is already up; decide now rather than granting an extension
      // past it (its own timer is due, but this keeps the clamp unconditional).
      wait.resolve();
      return;
    }
    if (wait.timer) {
      clearTimeout(wait.timer);
    }
    // Infinity means "the whole remaining ceiling" — see the exact-trigger guard
    // in the transcription handler. Math.min keeps the clamp unconditional.
    wait.timer = setTimeout(wait.resolve, Math.min(debounceMs, remaining));
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
    if (pendingSettle) {
      // resolve() clears the record and its timer (see settleWait's finish()).
      pendingSettle.resolve();
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
          } else if (isExactlyTriggerWord(text, VOICE_TRIGGER_WORD)) {
            // The narrow hole the debounce leaves open, closed: when the partial
            // so far IS exactly the trigger word, the very next character could
            // turn it into a longer word ("Evan" → "Evanescence is a great
            // band"), so the 250ms debounce would decide "addressed" on text
            // that is one glyph away from meaning the opposite. Such a partial
            // buys no shortcut at all — reset the timer to the FULL remaining
            // time to the absolute TRANSCRIPT_SETTLE_MS deadline (Infinity is
            // clamped to `remaining` there). Every OTHER partial keeps the
            // debounce untouched, so this is not a blanket ceiling wait.
            //
            // What this does NOT close: a mid-partial REVISION, e.g.
            // `.updated "Evan play"` then `.updated "Evanescence played"`. The
            // first partial is not exactly the trigger, so it takes the
            // debounce, and if the revision is more than 250ms behind it the
            // gate replies to audio that never addressed the bot. Closing that
            // requires an affirmative decision to reply ONLY after a terminal
            // `…transcription.completed` — the trade the owner declined,
            // because nothing confirms `grok-transcribe` ever emits a terminal
            // event and a possibly-permanently-mute bot is worse than a working
            // gate with a known narrow hole.
            extendSettleIfWaitingFor(utteranceSeq, Number.POSITIVE_INFINITY);
          } else {
            extendSettleIfWaitingFor(utteranceSeq, PARTIAL_SETTLE_DEBOUNCE_MS);
          }
          // Too late: this utterance's decision already ran, and this transcript
          // DIFFERS from the text it decided on — so the gate decided on text
          // that was not the final text (it read nothing, or the partial debounce
          // decided on a truncation). Report the measured lag and the knob that
          // fixes it: without this, a ceiling set too low looks exactly like "xAI
          // sent no transcript at all", which is the wrong thing to go debug.
          // A straggler that merely re-punctuates what was already decided on
          // normalises to the same string and is silent — it is the ordinary
          // second event of a normal turn and must not burn the warn-once latch.
          if (
            utteranceSeq === decidedSeq &&
            normalizeForTrigger(text) !== decidedText &&
            !warnedLateTranscription
          ) {
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
          // The text the decision actually used, normalised. A later transcript
          // for this seq that differs from it is evidence of a too-low ceiling.
          decidedText = normalizeForTrigger(text);
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
