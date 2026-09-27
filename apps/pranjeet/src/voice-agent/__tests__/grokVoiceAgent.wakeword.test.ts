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
  beforeEach(() => {
    jest.resetModules();
    resetSockets();
    process.env['GROK_API_KEY'] = 'test-key';
    process.env['VOICE_TRIGGER_WORD'] = 'evan';
  });

  const connect = async () => {
    const mod = await import('../grokVoiceAgent');
    const client = mod.createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() });
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
    // Minor 2 means a boundary only commits (and is worth ending) when audio
    // was actually appended for it — append audio before each boundary, as
    // production always does, rather than calling endUtterance() back to
    // back with nothing behind it.
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
    // NOTE: this now holds under either mechanism alone (the seq-stamped read
    // gate, or the audio-appended gate on response.create), so it is a
    // redundancy check rather than coverage for a specific guard.
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

  it('drops a transcript that arrives after its utterance already decided, so a later utterance cannot inherit it (Critical 1)', async () => {
    const { client, sock } = await connect();
    // First utterance: no transcript ever arrives for it -> silence, and the
    // slot disarms once its settle window closes.
    await client.endUtterance();
    // A transcript now arrives late, addressed to nobody in particular by the
    // time it lands. It must not be picked up by the *next* utterance.
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('serializes overlapping endUtterance() calls so only the first runs before the second even starts (Critical 2)', async () => {
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

  it('warns once per client when no transcription event ever arrives, naming the configured model', async () => {
    const { client, mod } = await connect();
    // Minor 1: the warning is gated on audio actually having been appended
    // for the utterance — a silent boundary with no speech is not evidence
    // the wake-word gate is dead.
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

  it('does not re-arm the transcript slot on a session.updated re-ack after a reply, so a later utterance cannot inherit a late transcript (CRITICAL regression)', async () => {
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

  it("does not let the next utterance's wake-word transcript answer for the one still settling (IMPORTANT regression)", async () => {
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

  it('sends no commit for a boundary with no audio appended, but does for one with audio (Minor 2)', async () => {
    const { client, sock } = await connect();
    // No audio at all before this boundary.
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(0);

    // Audio arrives before the next boundary.
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
  });

  it('does not fire the no-transcription warning for a boundary with no audio appended (Minor 1)', async () => {
    const { client } = await connect();
    await client.endUtterance();
    expect(mockLogger.warn).not.toHaveBeenCalled();
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

    it('treats an unset trigger word as never addressed, so it fails closed', async () => {
      const { isAddressed } = await import('../grokVoiceAgent');
      expect(isAddressed('anything at all', '')).toBe(false);
    });
  });
});
