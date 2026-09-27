# Pranjeet: wake-word turn-taking and hard response brevity

Date: 2026-09-25
Status: approved (design)

## Problem

In conversation mode Pranjeet answers everything anyone says in the voice channel, and
its answers run long. Only the second half is a prompt problem.

### Why it speaks unprompted (structural, not prompt)

Two independent causes:

1. `packages/utils/src/voice/voiceInteractionManager.ts:449-479` — when conversation mode is
   on, `processAudioChunk` streams every chunk from any listening user straight to the cached
   xAI client via `client.sendAudio(chunk.buffer)` and returns. The `VOICE_TRIGGER_WORD` gate
   at line 538 lives on the STT command path, which that early return skips. **The trigger
   word does nothing in conversation mode today.**
2. `apps/pranjeet/src/voice-agent/grokVoiceAgent.ts:173` sets
   `turn_detection: { type: 'server_vad' }` with no way to suppress auto-response. xAI creates
   a response at every detected end-of-speech.

No wording of `session.instructions` can fix this: the server solicits a reply every turn.

### Why answers run long

The xAI voice API exposes no `max_tokens` / output-length field, so the prompt is the only
lever. Today it is a weak one: `VOICE_ACCENT_CRITICAL` (~90 words) and `ACCENT_REMINDER_END`
in `apps/pranjeet/src/prompts/voice.ts` bracket the persona and are roughly two-thirds of the
instruction budget, re-sent after every turn (`grokVoiceAgent.ts:273`). The persona's own
length rule (`Default length: 1-4 sentences`) is both drowned out and far looser than wanted.

## Target behaviour

- Silent until addressed by the wake word, **every utterance**. No open follow-up window.
- Responses: ~5 words typical, 10 words hard maximum.

## Design

### 1. Turn-taking

Verified against xAI's voice-agent docs:

- `turn_detection: null` — server never auto-responds. The client owns turns via
  `input_audio_buffer.commit` + `response.create`, or discards with `input_audio_buffer.clear`.
- `audio.input.transcription.model: 'grok-transcribe'` — server emits
  `conversation.item.input_audio_transcription.updated`, a cumulative transcript of the user's
  own speech.

So the wake-word transcript arrives on the socket we already hold: no whisper roundtrip, no new
dependency, no extra API bill.

Flow:

1. Keep streaming live. `sendAudio` already emits `input_audio_buffer.append`
   (`grokVoiceAgent.ts:299-305`), so audio upload adds no latency.
2. Utterance boundaries come free from Discord: `opusDecoder.on('end')` fires on silence
   (`voiceInteractionManager.ts:260`). In conversation mode that handler is currently a no-op
   because `audioBuffer` is empty.
3. Add `endUtterance()` to the `GrokVoiceAgentClient` interface. On Discord silence it always
   sends `input_audio_buffer.commit`, then sends `response.create` **only** if the transcript
   starts with the trigger word. Transcript state resets either way.

   Committing unconditionally avoids a circularity: if the server only emits a transcript for
   committed audio, gating the commit on the transcript would deadlock. `commit` merely closes
   the input buffer — it does not produce a reply — so the wake word gates `response.create`
   alone. The cost is that unaddressed speech still enters the conversation context, which
   grows it over a long session. If transcripts turn out to arrive before commit,
   `input_audio_buffer.clear` on a miss is the tighter alternative and keeps that chatter out.

4. The wake word is the existing `VOICE_TRIGGER_WORD` config, matched with the same
   case-insensitive prefix logic as `voiceInteractionManager.ts:538`.

The manager stays dumb — it calls `endUtterance()`; the client decides. The design fails
**closed**: a bug in the commit path makes Pranjeet mute, not talkative.

Settle window: the `grok-transcribe` transcript is cumulative and may trail the audio. If the
`updated` event arrives after Discord's silence event, a real wake word would be dropped.
`endUtterance()` therefore waits a short settle period (default 300ms, tunable) for a
transcript update before deciding.

### 2. Brevity

Three edits, all length-related:

- `apps/pranjeet/src/prompts/voice.ts` — cut `VOICE_ACCENT_CRITICAL` and `ACCENT_REMINDER_END`
  to one line each, and spend the reclaimed budget on a single hard rule stated in words, not
  sentences: ~5 words typical, 10 maximum, placed at the top where it is not competing with
  accent nagging.
- `apps/pranjeet/src/prompts/personas/default.ts` — replace the `Default length: 1-4 sentences`
  rule with the word cap, so the body no longer contradicts the wrapper.
- Same file, `<behavioral_examples>` — the examples run up to 13 words and demonstrate length
  more forcefully than any rule states it. Trim each to within the cap.

Nothing else in the persona changes. In particular the protected-trait instruction in
`<core_rules>` is left exactly as-is; it is out of scope for a brevity and turn-taking change.

## Testing

- `buildVoiceInstructions` is pure: assert the word cap survives assembly, with and without the
  tools note, and for the empty-persona fallback.
- `endUtterance`: commits and requests a response on a wake-word match; clears on a miss;
  resets transcript state between utterances; handles a transcript arriving inside the settle
  window.
- Session config: `turn_detection` is null and the transcription model is set, so a regression
  back to `server_vad` fails a test rather than surfacing in a voice channel.

## Open item

If `grok-transcribe` turns out to be unavailable or gated, **stop and report** rather than
silently falling back. The fallback (buffer the utterance, transcribe via the existing
`SpeechRecognitionManager`, forward only on a match) works but adds roughly a second of latency
and a whisper call per utterance from everyone in the channel — that is a cost decision, not an
implementation detail.
