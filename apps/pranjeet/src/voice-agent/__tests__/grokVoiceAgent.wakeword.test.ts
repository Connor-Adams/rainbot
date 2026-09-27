jest.mock('ws', () =>
  jest.requireActual<typeof import('./helpers/fakeWs')>('./helpers/fakeWs').wsModuleMock()
);

// Captured so tests can assert on log.warn calls made by the module under
// test. Reassigned on every createLogger() call (i.e. every fresh import),
// so it always points at the logger the currently-imported module holds.
// Must start with "mock" — babel-plugin-jest-hoist forbids a jest.mock()
// factory from closing over any other out-of-scope variable.
let mockLogger: {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
};
jest.mock('@rainbot/shared', () => ({
  createLogger: () => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    return mockLogger;
  },
}));
jest.mock('../../redis', () => ({
  getGrokPersona: jest.fn().mockResolvedValue(null),
  getGrokVoice: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../prompts', () => ({
  getVoiceAgentInstructions: jest.fn().mockResolvedValue('INSTRUCTIONS'),
}));
jest.mock('../../audio/utils', () => ({
  resample48kStereoTo24kMono: (b: Buffer) => b,
}));
jest.mock('../tools', () => ({ VOICE_AGENT_MUSIC_TOOLS: [] }));

import { flush, resetSockets, sockets } from './helpers/fakeWs';

describe('wake-word gating', () => {
  let createdClients: Array<{ close(): void }> = [];

  beforeEach(() => {
    jest.resetModules();
    resetSockets();
    createdClients = [];
    process.env['GROK_API_KEY'] = 'test-key';
    process.env['VOICE_TRIGGER_WORD'] = 'evan';
    // The production default is 2000ms and is only ever paid in full when no
    // transcript arrives — which is most tests here, so they pin a short ceiling
    // to stay fast. Tests that are ABOUT the ceiling set their own value before
    // connect() (the module reads config at import, and beforeEach resets modules).
    process.env['VOICE_TRANSCRIPT_SETTLE_MS'] = '300';
  });

  afterEach(() => {
    // Close all clients created in the test to clear the 15-second heartbeat interval
    for (const client of createdClients) {
      if (client) {
        client.close();
      }
    }
    createdClients = [];
  });

  const connect = async () => {
    const mod = await import('../grokVoiceAgent');
    const client = mod.createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() });
    if (client) {
      createdClients.push(client);
    }
    const sock = sockets()[0];
    sock.emit('open');
    await flush();
    sock.serverSays({ type: 'session.updated' });
    return { client: client!, sock, mod };
  };

  it('commits and responds when the transcript starts with the wake word', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan, what is the queue?',
    });
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('commits but stays silent when the wake word is absent', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'so anyway I told him no',
    });
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('stays silent when no transcript ever arrives', async () => {
    const { client, sock } = await connect();
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('ignores leading punctuation and casing before the wake word', async () => {
    const { client, sock } = await connect();
    // A reply is gated on audio having been appended for the utterance, and a
    // transcript is only readable by the utterance whose audio it followed —
    // so a transcript with no audio behind it is a path production cannot
    // produce. Append audio first, as production always does.
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: '  ...EVAN skip this song',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('does not treat a wake word mid-sentence as being addressed', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'I was talking to Evan yesterday',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('resets transcript state between utterances', async () => {
    const { client, sock } = await connect();
    // A boundary only commits when audio was actually appended for it —
    // append audio before each boundary, as production always does.
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await client.endUtterance();
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    // State-reset intent preserved: only the first, wake-word-bearing
    // utterance produces a reply — the second does not inherit its text.
    // This test covers the seq read gate: the second utterance appends audio,
    // so the hadAudio gate cannot hold it shut on its own, and the test fails
    // if the slot.seq === seq check is removed.
    expect(sock.sentOfType('response.create')).toHaveLength(1);
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(2);
  });

  it('accepts a cumulative transcript that arrives on the delta field', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      delta: 'Evan play something',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('sends nothing before the session is configured', async () => {
    const mod = await import('../grokVoiceAgent');
    const client = mod.createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() })!;
    createdClients.push(client);
    const sock = sockets()[0];
    sock.emit('open');
    await flush();
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(0);
  });

  it('accepts a transcript that arrives inside the settle window (not just before endUtterance)', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    const pending = client.endUtterance();
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.updated',
        transcript: 'Evan play something',
      });
    }, 50);
    await pending;
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('drops a transcript that arrives only after the NEXT utterance has started', async () => {
    const { client, sock } = await connect();
    // Utterance 1 speaks and its whole settle window elapses with no transcript,
    // so it decides on silence. (A transcript landing INSIDE that window is a
    // different case and now opens the gate — see the probe test below.)
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    // Only now does a transcript land. Utterance 1 has already decided, so it is
    // unreadable; utterance 2 must not inherit it either.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('opens the gate for a transcript delivered 400ms after the boundary, and does not wait out the ceiling', async () => {
    // The reviewer's probe, and the shape of an API that transcribes input on
    // commit-completion rather than during speech: the transcript lands hundreds
    // of ms AFTER endUtterance() was called. It must still open the gate...
    // A deliberately huge ceiling: the promptness assertion below is the only
    // thing that detects a bare settle timer, so the gap between "decided when
    // the transcript landed" (~400ms) and "decided at the ceiling" (~5000ms)
    // is made as wide as possible — ~2100ms of slack instead of ~800ms.
    process.env['VOICE_TRANSCRIPT_SETTLE_MS'] = '5000';
    const { client, sock, mod } = await connect();
    expect(mod.TRANSCRIPT_SETTLE_MS).toBe(5000);
    client.sendAudio(Buffer.alloc(20));
    const startedAt = Date.now();
    const pending = client.endUtterance();
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Evan, skip this song',
      });
    }, 400);
    await pending;
    const elapsed = Date.now() - startedAt;
    expect(sock.sentOfType('response.create')).toHaveLength(1);
    // ...and the decision must happen WHEN THE TRANSCRIPT LANDS, not at the
    // ceiling. That is what keeps a generous ceiling free, and what keeps the
    // manager's deaf window (it awaits onUtteranceEnd before resubscribing)
    // short. A bare settle timer fails here even though it would still reply.
    expect(elapsed).toBeLessThan(2500);
  });

  it('decides on the FINAL transcript, not a cumulative partial that happens to match', async () => {
    // The canonical counter-example. "Evan" is a prefix of "Evanescence", so a
    // gate that resolved on the first `.updated` would reply to audio that never
    // addressed the bot. Only the terminal `.completed` may end the wait.
    process.env['VOICE_TRANSCRIPT_SETTLE_MS'] = '2000';
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    const pending = client.endUtterance();
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.updated',
        transcript: 'Evan',
      });
    }, 30);
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Evanescence is a great band',
      });
    }, 90);
    await pending;
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('answers a multi-word trigger whose first word arrives alone as a partial', async () => {
    // The other half of the same fix: deciding on the partial "Hey" is
    // fail-closed, but it makes every multi-word trigger unusable against a
    // streaming transcriber. Waiting for the terminal text answers correctly.
    process.env['VOICE_TRANSCRIPT_SETTLE_MS'] = '2000';
    process.env['VOICE_TRIGGER_WORD'] = 'hey bot';
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    const pending = client.endUtterance();
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.updated',
        transcript: 'Hey',
      });
    }, 30);
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Hey bot, play music',
      });
    }, 90);
    await pending;
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('decides by the absolute ceiling when only partials ever arrive, however many', async () => {
    // `grok-transcribe` may emit `.updated` only, so a partial must be allowed to
    // shorten the wait — but the extension it buys is clamped to the ceiling
    // measured from when the wait began. Without that clamp an unbroken stream of
    // partials defers the reply for as long as the user keeps generating them.
    process.env['VOICE_TRANSCRIPT_SETTLE_MS'] = '1000';
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    const startedAt = Date.now();
    const pending = client.endUtterance();
    // 10 partials, 200ms apart (2000ms of stream) — each one closer together
    // than the 250ms partial debounce, so only the absolute ceiling can end it.
    let n = 0;
    const stream = setInterval(() => {
      n += 1;
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.updated',
        transcript: `Evan play something ${'la '.repeat(n)}`,
      });
      if (n >= 10) clearInterval(stream);
    }, 200);
    await pending;
    const elapsed = Date.now() - startedAt;
    clearInterval(stream);
    // Decided at the ceiling (~1000ms), not after the stream finally stopped
    // (~2250ms). Asserted as a bound so an unclamped debounce fails here
    // cleanly instead of hanging the test out to its timeout.
    expect(elapsed).toBeLessThan(1400);
    // ...and it decided on the partial it had, so the gate is not merely mute.
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('warns once, with the measured lag and the env var to raise, when a transcript arrives after the decision', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    // Too late by construction: the 300ms ceiling already elapsed.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Evan hello',
    });
    const lateWarnings = () =>
      mockLogger.warn.mock.calls
        .map((c) => (c as [string])[0])
        .filter((m) => m.includes('after its reply decision'));
    expect(lateWarnings()).toHaveLength(1);
    expect(lateWarnings()[0]).toMatch(/arrived \d+ms after its reply decision/);
    expect(lateWarnings()[0]).toContain('VOICE_TRANSCRIPT_SETTLE_MS');
    // Warn-once per client: a second late transcript does not warn again.
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Evan hello again',
    });
    expect(lateWarnings()).toHaveLength(1);
  });

  it('does not fire the late-transcription diagnostic on a normal turn that replied', async () => {
    // The diagnostic is about a ceiling so low the gate was starved. A turn whose
    // decision READ a transcript was not starved, yet transcription events keep
    // arriving for it (a trailing `.updated` after `.completed`, the second event
    // of any normal turn) — and the warning is warn-once per client, so firing it
    // here burns the latch and the real too-low-ceiling case can never report.
    process.env['VOICE_TRANSCRIPT_SETTLE_MS'] = '2000';
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    const pending = client.endUtterance();
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.updated',
        transcript: 'Evan, skip',
      });
    }, 30);
    setTimeout(() => {
      sock.serverSays({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Evan, skip this song',
      });
    }, 90);
    await pending;
    expect(sock.sentOfType('response.create')).toHaveLength(1);
    // A straggler for the same (already-decided) utterance, as a real socket sends.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan, skip this song.',
    });
    const lateWarnings = mockLogger.warn.mock.calls
      .map((c) => (c as [string])[0])
      .filter((m) => m.includes('after its reply decision'));
    expect(lateWarnings).toHaveLength(0);
  });

  it('defaults the settle ceiling to 2000ms and reads VOICE_TRANSCRIPT_SETTLE_MS when set', async () => {
    delete process.env['VOICE_TRANSCRIPT_SETTLE_MS'];
    const unset = await import('../grokVoiceAgent');
    expect(unset.TRANSCRIPT_SETTLE_MS).toBe(2000);
    jest.resetModules();
    process.env['VOICE_TRANSCRIPT_SETTLE_MS'] = '750';
    const configured = await import('../grokVoiceAgent');
    expect(configured.TRANSCRIPT_SETTLE_MS).toBe(750);
  });

  it('serializes overlapping endUtterance() calls so only the first runs before the second starts', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    const p1 = client.endUtterance();
    const p2 = client.endUtterance();
    // Flush microtasks: the first call's synchronous prefix (through its
    // commit) should have run and suspended on the settle-window timer, but
    // the second must not have started at all yet — it is chained behind the
    // first's promise, not fired independently.
    await flush();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
    // A wake-word transcript now lands, stamped for the utterance run 1 owns.
    // The REPLY count is the sharp serialization signal: serialized, run 1
    // consumes the appended audio (and the transcript) and replies, and run 2
    // finds no audio of its own to answer for; unserialized, both runs would
    // sit in overlapping settle windows and both would reply.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await Promise.all([p1, p2]);
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('opens the gate on a "completed" transcription event the same way "updated" does', async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Evan skip this',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('does not open the gate on a "delta" transcription event, and warns once that it cannot', async () => {
    const { client, sock } = await connect();
    // Audio IS appended, so the only reason for silence here is that a .delta
    // fragment is deliberately not stitched into the slot: an incremental
    // fragment landing across an utterance boundary could synthesize a wake
    // word nobody said. The deliberate outcome is silence PLUS a diagnostic.
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'Evan play something',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
    const warnings = mockLogger.warn.mock.calls.map((c) => (c as [string])[0]);
    const unhandled = warnings.filter((m) =>
      m.includes('unhandled transcription event conversation.item.input_audio_transcription.delta')
    );
    expect(unhandled).toHaveLength(1);
    // A .delta-only API must not look like "no transcription event ever
    // arrived" — that warning is about a DIFFERENT failure and its latch must
    // still be free to fire, so the unhandled-event warning names the type.
    expect(unhandled[0]).toContain('the wake-word gate cannot open on it');
    // Warn-once per client: a second .delta does not warn again.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: ' more words',
    });
    const after = mockLogger.warn.mock.calls
      .map((c) => (c as [string])[0])
      .filter((m) => m.includes('unhandled transcription event'));
    expect(after).toHaveLength(1);
  });

  it('names the unhandled event types the socket actually sent in the no-transcription warning', async () => {
    const { client, sock } = await connect();
    // xAI's transcription event name may differ EARLIER than the prefix the
    // unhandled-transcription diagnostic pattern-matches on, in which case that
    // diagnostic says nothing at all and this list is the only evidence.
    sock.serverSays({ type: 'input_audio.transcript.final', transcript: 'Evan hello' });
    sock.serverSays({ type: 'some.other.event' });
    sock.serverSays({ type: 'input_audio.transcript.final', transcript: 'Evan hello' });
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    const [message] = mockLogger.warn.mock.calls[0] as [string];
    expect(message).toContain('input_audio.transcript.final');
    expect(message).toContain('some.other.event');
    // Distinct types only — the repeated one is listed once.
    expect(message.match(/input_audio\.transcript\.final/g)).toHaveLength(1);
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('warns once per client when no transcription event ever arrives, naming the configured model', async () => {
    const { client, mod } = await connect();
    // The warning is gated on audio having been appended — a silent boundary
    // with no speech is not evidence the wake-word gate is dead.
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [message] = mockLogger.warn.mock.calls[0] as [string];
    expect(message).toContain(mod.INPUT_TRANSCRIPTION_MODEL);
    // A second utterance with the same problem must not warn again.
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not re-arm the transcript slot on a session.updated re-ack so a later utterance cannot inherit a late transcript', async () => {
    const { client, sock } = await connect();
    // Utterance A: addressed, produces the one legitimate reply.
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);

    // The reply triggers response.created, which re-sends session.update; the
    // server acks it with a SECOND session.updated. session.updated no longer
    // arms anything (the re-arm flag is gone), so the scenario is now held
    // shut by the seq stamp alone — the assertion is unchanged and this stays
    // as the fence against any ack ever reopening the slot again.
    sock.serverSays({ type: 'response.created', response: { id: 'r1' } });
    await flush();
    sock.serverSays({ type: 'session.updated' });

    // A late transcript for utterance A's own (already-decided) turn
    // arrives. It must be dropped, not picked up by utterance B below.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });

    // Utterance B: new audio, no wake word of its own.
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();

    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it("does not let the next utterance's wake-word transcript answer for the one still settling", async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    // Utterance 1 has no transcript of its own; start ending it (it enters
    // its settle window and does not resolve yet).
    const pending = client.endUtterance();
    // Flush so run() actually starts (sends its commit and marks itself as
    // awaiting the next utterance's audio) before utterance 2's audio
    // arrives — endUtterance() only queues onto the chain synchronously; the
    // chained run() itself begins on a later microtask (see the Critical-2
    // test above, which flushes for the same reason).
    await flush();
    // Before utterance 1 has decided, utterance 2 already starts — new
    // audio arrives for it.
    client.sendAudio(Buffer.alloc(20));
    // A wake-word transcript arrives. By now it is stamped for utterance 2
    // (the one that owns the slot), not utterance 1 (the one still
    // settling).
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await pending;
    expect(sock.sentOfType('response.create')).toHaveLength(0);
    // ...and the other half of the guarantee: utterance 2's own text is still
    // there for utterance 2 to decide on. Utterance 1's run must not have
    // cleared the slot on its way out (it no longer owns it), or the bot goes
    // silently mute on a genuine wake word. Nothing else in this suite pins
    // "the bot is not muted", so this assertion is the safety net for the
    // read gate: exactly ONE reply overall, and it belongs to utterance 2.
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it("does not let a straggler .delta from a finished utterance become the head of the next utterance's transcript", async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    // Utterance 1 finishes with no transcript of its own; the slot disarms.
    await client.endUtterance();
    // A straggler .delta for utterance 1 arrives after it already decided and
    // must not seed the next utterance's slot. This is now structural rather
    // than guarded: .delta is not stitched into the slot at all, so the test
    // is a regression fence against reintroducing incremental handling.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'Evan ',
    });
    // Utterance 2 starts and says something unaddressed. If the straggler
    // had become its head, appending this text would form a transcript
    // that (wrongly) opens with the wake word.
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: "let's go home",
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('sends no commit for a boundary with no audio appended, but does for one with audio', async () => {
    const { client, sock } = await connect();
    // No audio at all before this boundary.
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(0);

    // Audio arrives before the next boundary.
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
  });

  it('does not fire the no-transcription warning for a boundary with no audio appended', async () => {
    const { client } = await connect();
    await client.endUtterance();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('a sub-threshold noise chunk does not start a new utterance', async () => {
    const { client, sock } = await connect();
    // Utterance 1: real audio
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    // Noise chunk: must NOT bump utteranceSeq or start utterance 2
    client.sendAudio(Buffer.alloc(4));
    // Deliver a wake-word transcript; if the noise bumped the sequence,
    // utterance 2 would own the slot and reply to this transcript (wrong).
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    // Utterance 2: real audio, starts only because of this chunk
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    // Zero replies: utterance 1 closed with no transcript, utterance 2
    // inherited the previous utterance's stale transcript (which was already
    // dropped), and must not reply.
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  describe('isAddressed', () => {
    it('matches only at the start, after stripping punctuation', async () => {
      const { isAddressed } = await import('../grokVoiceAgent');
      expect(isAddressed('Evan, stop', 'evan')).toBe(true);
      expect(isAddressed('“evan” stop', 'evan')).toBe(true);
      expect(isAddressed('hey evan stop', 'evan')).toBe(false);
      expect(isAddressed('evanescence is a band', 'evan')).toBe(false);
      expect(isAddressed('', 'evan')).toBe(false);
    });

    it('matches a multi-word trigger across the punctuation a transcriber inserts', async () => {
      const { isAddressed } = await import('../grokVoiceAgent');
      // "hey bot" is the documented example in README.md and RAILWAY_DEPLOY.md,
      // and stripping only LEADING punctuation made it unmatchable.
      expect(isAddressed('Hey, bot, play music', 'hey bot')).toBe(true);
      expect(isAddressed('hey bot', 'hey bot')).toBe(true);
      expect(isAddressed('  “Hey — bot!” play music', 'hey bot')).toBe(true);
      expect(isAddressed('Hey  bot play music', 'hey  bot')).toBe(true);
      // Still anchored at the start, and still boundary-checked.
      expect(isAddressed('okay hey bot play music', 'hey bot')).toBe(false);
      expect(isAddressed('hey bottle opener', 'hey bot')).toBe(false);
      expect(isAddressed('hey, robot, play music', 'hey bot')).toBe(false);
    });

    it('treats a trigger word of only punctuation as never addressed', async () => {
      const { isAddressed } = await import('../grokVoiceAgent');
      expect(isAddressed('anything at all', '...')).toBe(false);
    });

    it('treats an unset trigger word as never addressed, so it fails closed', async () => {
      const { isAddressed } = await import('../grokVoiceAgent');
      expect(isAddressed('anything at all', '')).toBe(false);
    });
  });
});
