# Pranjeet Wake-Word Turn-Taking and Response Brevity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pranjeet stay silent in a voice channel until addressed by a wake word on every utterance, and cap its spoken replies at 10 words.

**Architecture:** Turn control moves from xAI's server VAD to our client. The session sets `turn_detection: null` so xAI never auto-responds, and `audio.input.transcription.model: 'grok-transcribe'` so xAI streams back a transcript of the _user's_ speech on the socket we already hold. Discord's own silence detection (`opusDecoder.on('end')`) delimits utterances; on each boundary the client commits the audio buffer and sends `response.create` only if the transcript starts with the wake word. Brevity is prompt-only — the xAI voice API exposes no output-length field.

**Tech Stack:** TypeScript, `ws` WebSocket client, xAI realtime voice API, `@discordjs/voice` + `prism-media` for receive, Jest + ts-jest (colocated `__tests__/`), Yarn 4 workspaces + Turbo.

## Global Constraints

- Response length: **10 words hard maximum, ~5 typical.** Stated in words, never in sentences.
- The protected-trait instruction in `apps/pranjeet/src/prompts/personas/default.ts` `<core_rules>` is **out of scope — do not edit, reword, or relocate that line.** Only the length rule and the behavioural examples change in that file.
- Design fails **closed**: if turn-taking logic breaks, Pranjeet must go silent, never babble. Never reintroduce `turn_detection: { type: 'server_vad' }`.
- Never set `idle_timeout_ms` on the session — it makes xAI re-engage the user unprompted, which is exactly the behaviour being removed.
- Wake word comes from the existing `VOICE_TRIGGER_WORD` env var (default `evan`). Do not hardcode a word.
- Workspace dependency direction is ESLint-enforced: `apps` → `packages` only, never the reverse, and never a bare-path import. Use `@rainbot/*`.
- `@rainbot/protocol` and `@rainbot/utils` resolve from their **`dist/` .d.ts**. After editing `packages/protocol`, run `yarn build:ts` from the repo root before type-checking or testing anything that consumes it.
- Definition of done for the whole plan: `yarn validate` (type-check && format:check && test) passes from the repo root.

---

### Task 1: Hard word cap in the voice instruction wrapper

The accent block is roughly two-thirds of the instruction budget and is re-sent after every turn, drowning out any length rule. Cut it to one line each end, and spend the reclaimed room on the cap.

**Files:**

- Modify: `apps/pranjeet/src/prompts/voice.ts:6-10` (`VOICE_ACCENT_CRITICAL`), `:22` (`ACCENT_REMINDER_END`), `:26-34` (`buildVoiceInstructions`)
- Test: `apps/pranjeet/src/prompts/__tests__/voice.test.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `buildVoiceInstructions(personaBody: string, withTools: boolean): string` — signature unchanged. Exports a new `const VOICE_BREVITY: string` for the test to assert against.

- [ ] **Step 1: Write the failing test**

Create `apps/pranjeet/src/prompts/__tests__/voice.test.ts`:

```ts
import { buildVoiceInstructions, VOICE_BREVITY } from '../voice';

const wordCount = (s: string) => s.trim().split(/\s+/).length;

describe('buildVoiceInstructions', () => {
  it('states the 10-word cap and the 5-word target', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out).toContain('10 words');
    expect(out).toContain('5 words');
  });

  it('puts the brevity rule before the accent instruction', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out.indexOf(VOICE_BREVITY.trim())).toBeLessThan(out.indexOf('accent'));
  });

  it('keeps the accent instruction under 30 words at each end', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    const accentLines = out.split('\n').filter((l) => l.toLowerCase().includes('accent'));
    expect(accentLines.length).toBeGreaterThan(0);
    for (const line of accentLines) expect(wordCount(line)).toBeLessThanOrEqual(30);
  });

  it('keeps the cap when the persona body is empty (fallback path)', () => {
    const out = buildVoiceInstructions('   ', false);
    expect(out).toContain('10 words');
  });

  it('keeps the cap when the tools note is appended', () => {
    const out = buildVoiceInstructions('You are terse.', true);
    expect(out).toContain('10 words');
    expect(out).toContain('music tools');
  });

  it('never returns an empty string', () => {
    expect(buildVoiceInstructions('', false).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @rainbot/pranjeet-worker test src/prompts/__tests__/voice.test.ts`
Expected: FAIL — `VOICE_BREVITY` is not exported from `../voice`.

- [ ] **Step 3: Write minimal implementation**

In `apps/pranjeet/src/prompts/voice.ts`, replace the `VOICE_ACCENT_CRITICAL` and `ACCENT_REMINDER_END` constants and `buildVoiceInstructions` with:

```ts
export const VOICE_BREVITY = `
[LENGTH — HARD LIMIT]
Maximum 10 words per reply. Target 5 words. One sentence. Never two.
Do not explain, qualify, or add context. Cut every word that is not load-bearing.
`;

const VOICE_ACCENT_CRITICAL =
  '[ACCENT] Speak urban Indian (India) English on every word, first to last. Never drop it mid-reply.';

const PERSONA_PREFIX =
  'Persona (use for every response—voice and text must match this character):\n\n';

const FALLBACK_INSTRUCTIONS =
  'You are a rude, chaotic assistant. Stay in character. Use a consistent accent for the entire response.';

const ACCENT_REMINDER_END = '\n\n[REMINDER] Keep the accent to the last word. Stay under 10 words.';

/**
 * Build full voice instructions from a persona body. Never returns empty string.
 * If personaBody is empty, uses FALLBACK_INSTRUCTIONS.
 *
 * Order matters: the length cap leads, because the xAI voice API exposes no
 * max-output-tokens field — the prompt is the only lever on reply length, and
 * it previously lost to ~90 words of accent nagging at both ends.
 */
export function buildVoiceInstructions(personaBody: string, withTools: boolean): string {
  const trimmed = (personaBody ?? '').trim();
  const persona = trimmed.length > 0 ? PERSONA_PREFIX + trimmed : FALLBACK_INSTRUCTIONS;
  const withToolsNote = withTools
    ? '\n\nWhen you use music tools (play, skip, pause, etc.), respond in your persona—do not switch to a generic assistant tone. Announce what you did in character, under 10 words.'
    : '';
  return `${VOICE_BREVITY.trim()}\n\n${VOICE_ACCENT_CRITICAL}\n\n${persona}${withToolsNote}${ACCENT_REMINDER_END}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @rainbot/pranjeet-worker test src/prompts/__tests__/voice.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/pranjeet/src/prompts/voice.ts apps/pranjeet/src/prompts/__tests__/voice.test.ts
git commit -m "feat(pranjeet): cap voice replies at 10 words and shrink the accent block"
```

---

### Task 2: Align the persona's own length rule and examples

The persona body still says `Default length: 1–4 sentences`, which contradicts the wrapper, and its `<behavioral_examples>` run up to 13 words. Examples teach length harder than rules state it, so both must come down.

**Files:**

- Modify: `apps/pranjeet/src/prompts/personas/default.ts`
- Test: `apps/pranjeet/src/prompts/__tests__/defaultPersona.test.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `defaultPersona` export unchanged in shape (`Persona` from `../types`).

**Do not touch any other line of `<core_rules>`.** Make exactly the five single-string replacements in Step 3.

- [ ] **Step 1: Write the failing test**

Create `apps/pranjeet/src/prompts/__tests__/defaultPersona.test.ts`:

```ts
import { defaultPersona } from '../personas/default';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe('default persona length discipline', () => {
  it('states the word cap, not a sentence count', () => {
    expect(defaultPersona.systemPrompt).toContain('10 words');
    expect(defaultPersona.systemPrompt).not.toMatch(/1[-–]4 sentences/);
  });

  it('keeps every behavioural example within the 10-word cap', () => {
    const block = defaultPersona.systemPrompt.match(
      /<behavioral_examples>([\s\S]*?)<\/behavioral_examples>/
    );
    expect(block).not.toBeNull();
    const quoted = block![1].match(/[“"][^”"]+[”"]/g) ?? [];
    expect(quoted.length).toBeGreaterThan(0);
    for (const q of quoted) {
      const words = wordCount(q.replace(/[“”"]/g, ''));
      expect(words).toBeLessThanOrEqual(10);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @rainbot/pranjeet-worker test src/prompts/__tests__/defaultPersona.test.ts`
Expected: FAIL on both tests — the prompt says `Default length: 1–4 sentences.`, and the "Pick a lane" example is 13 words.

- [ ] **Step 3: Write minimal implementation**

In `apps/pranjeet/src/prompts/personas/default.ts`, make exactly these five replacements. Each `old` string appears once; leave every other line untouched.

1. old: `- Default length: 1–4 sentences.`
   new: `- Hard limit: 10 words per reply. Target 5. One sentence, never two.`

2. old: `“That’s not strategy. That’s wishful thinking with a logo.”`
   new: `“Not strategy. Wishful thinking with a logo.”`

3. old: `“Define ‘better.’ Better how? Faster? Cheaper? Or just louder?”`
   new: `“Define better. Faster? Cheaper? Or louder?”`

4. old: `“Good. You came prepared. Now we can actually build something.”`
   new: `“Good. You came prepared. Now build.”`

5. old: `“Pick a lane. You can’t optimize for speed and refuse to remove weight.”`
   new: `“Pick a lane. Speed or weight.”`

Note the curly quotes and apostrophes — copy the `old` strings exactly as they appear in the file, or the edit will not match.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @rainbot/pranjeet-worker test src/prompts/__tests__/defaultPersona.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/pranjeet/src/prompts/personas/default.ts apps/pranjeet/src/prompts/__tests__/defaultPersona.test.ts
git commit -m "feat(pranjeet): put the persona's own length rule and examples under the word cap"
```

---

### Task 3: Session config — client-owned turns and input transcription

Stop xAI from auto-responding, and ask it for a transcript of the user's speech so the wake-word check needs no separate STT call.

**Files:**

- Modify: `apps/pranjeet/src/voice-agent/grokVoiceAgent.ts:63-71` (the `sessionConfig` type), `:171-180` (the `session` literal built on `open`)
- Test: `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.session.test.ts` (create)

**Interfaces:**

- Consumes: `buildVoiceInstructions` via `getVoiceAgentInstructions` (Task 1) — mocked in this test.
- Produces: the session payload shape later tasks rely on:

  ```ts
  turn_detection: null;
  audio: {
    input: {
      format: {
        type: 'audio/pcm';
        rate: number;
      }
      transcription: {
        model: string;
      }
    }
    output: {
      format: {
        type: 'audio/pcm';
        rate: number;
      }
    }
  }
  ```

  Also exports `const INPUT_TRANSCRIPTION_MODEL = 'grok-transcribe'`.

- [ ] **Step 1: Write the failing test**

Create `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.session.test.ts`. Task 4 repeats this mock block rather than importing it, because `jest.mock` calls must be hoisted per file.

```ts
jest.mock('ws', () => {
  const mod = jest.requireActual<typeof import('events')>('events');
  class MockWS extends mod.EventEmitter {
    static OPEN = 1;
    readyState = 1;
    sent: Array<Record<string, unknown>> = [];
    send(raw: string) {
      this.sent.push(JSON.parse(raw) as Record<string, unknown>);
    }
    ping() {}
    close() {
      this.readyState = 3;
    }
    serverSays(event: Record<string, unknown>) {
      this.emit('message', Buffer.from(JSON.stringify(event)));
    }
    sentOfType(type: string) {
      return this.sent.filter((e: Record<string, unknown>) => e['type'] === type);
    }
    constructor() {
      super();
      (global as unknown as { __sockets: unknown[] }).__sockets.push(this);
    }
  }
  return { __esModule: true, default: MockWS };
});

jest.mock('@rainbot/shared', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
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

interface Sock {
  readyState: number;
  sent: Array<Record<string, unknown>>;
  emit(name: string, ...args: unknown[]): boolean;
  serverSays(event: Record<string, unknown>): void;
  sentOfType(type: string): Array<Record<string, unknown>>;
}

/** Flush the microtask queue so the async IIFE in the 'open' handler completes. */
const flush = () => new Promise((r) => setImmediate(r));

describe('Voice Agent session config', () => {
  beforeEach(() => {
    jest.resetModules();
    (global as unknown as { __sockets: unknown[] }).__sockets = [];
    process.env['GROK_API_KEY'] = 'test-key';
    process.env['VOICE_TRIGGER_WORD'] = 'evan';
  });

  const connect = async () => {
    const { createGrokVoiceAgentClient } = await import('../grokVoiceAgent');
    const client = createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() });
    const sock = (global as unknown as { __sockets: Sock[] }).__sockets[0];
    sock.emit('open');
    await flush();
    return { client, sock };
  };

  it('disables server VAD so xAI never auto-responds', async () => {
    const { sock } = await connect();
    const update = sock.sentOfType('session.update')[0] as {
      session: { turn_detection: unknown };
    };
    expect(update.session.turn_detection).toBeNull();
  });

  it('requests input transcription so the wake word can be read off the socket', async () => {
    const { sock } = await connect();
    const update = sock.sentOfType('session.update')[0] as {
      session: { audio: { input: { transcription?: { model: string } } } };
    };
    expect(update.session.audio.input.transcription?.model).toBe('grok-transcribe');
  });

  it('never sets idle_timeout_ms, which would re-engage the user unprompted', async () => {
    const { sock } = await connect();
    const update = sock.sentOfType('session.update')[0] as { session: Record<string, unknown> };
    expect(update.session['idle_timeout_ms']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @rainbot/pranjeet-worker test src/voice-agent/__tests__/grokVoiceAgent.session.test.ts`
Expected: FAIL — `turn_detection` is `{ type: 'server_vad' }`, and `audio.input.transcription` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `apps/pranjeet/src/voice-agent/grokVoiceAgent.ts`, add the constant below `PING_INTERVAL_MS`:

```ts
/**
 * Asking xAI to transcribe the USER's input is what makes the wake word free:
 * the transcript arrives on the socket we already hold, so no whisper roundtrip
 * and no second API bill. Emitted as conversation.item.input_audio_transcription.updated.
 */
export const INPUT_TRANSCRIPTION_MODEL = 'grok-transcribe';
```

Replace the `sessionConfig` declaration (currently `turn_detection: { type: 'server_vad' }`) with:

```ts
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
```

And replace the `session` literal inside the `open` handler with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @rainbot/pranjeet-worker test src/voice-agent/__tests__/grokVoiceAgent.session.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/pranjeet/src/voice-agent/grokVoiceAgent.ts apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.session.test.ts
git commit -m "feat(pranjeet): take turn control off xAI's server VAD and request input transcripts"
```

---

### Task 4: `endUtterance()` — commit always, respond only when addressed

The wake-word gate itself. Commit is unconditional: if the server only transcribes _committed_ audio, gating the commit on the transcript would deadlock. `commit` closes the input buffer and does not produce a reply, so the wake word gates `response.create` alone.

**Files:**

- Modify: `apps/pranjeet/src/voice-agent/grokVoiceAgent.ts` — `GrokVoiceAgentClient` interface (`:38-41`), the `message` switch (`~:204-280`), the returned object (`~:299-309`)
- Test: `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.wakeword.test.ts` (create)

**Interfaces:**

- Consumes: `INPUT_TRANSCRIPTION_MODEL` and the session shape from Task 3; `VOICE_TRIGGER_WORD` from `../config`.
- Produces: `GrokVoiceAgentClient` gains `endUtterance(): Promise<void>`. Also exports `TRANSCRIPT_SETTLE_MS = 300` and `isAddressed(transcript: string, triggerWord: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.wakeword.test.ts`. Repeat the mock block rather than importing it — the `jest.mock` calls must be hoisted in this file.

```ts
jest.mock('ws', () => {
  const mod = jest.requireActual<typeof import('events')>('events');
  class MockWS extends mod.EventEmitter {
    static OPEN = 1;
    readyState = 1;
    sent: Array<Record<string, unknown>> = [];
    send(raw: string) {
      this.sent.push(JSON.parse(raw) as Record<string, unknown>);
    }
    ping() {}
    close() {
      this.readyState = 3;
    }
    serverSays(event: Record<string, unknown>) {
      this.emit('message', Buffer.from(JSON.stringify(event)));
    }
    sentOfType(type: string) {
      return this.sent.filter((e: Record<string, unknown>) => e['type'] === type);
    }
    constructor() {
      super();
      (global as unknown as { __sockets: unknown[] }).__sockets.push(this);
    }
  }
  return { __esModule: true, default: MockWS };
});

jest.mock('@rainbot/shared', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
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

interface Sock {
  readyState: number;
  sent: Array<Record<string, unknown>>;
  emit(name: string, ...args: unknown[]): boolean;
  serverSays(event: Record<string, unknown>): void;
  sentOfType(type: string): Array<Record<string, unknown>>;
}

const flush = () => new Promise((r) => setImmediate(r));

describe('wake-word gating', () => {
  beforeEach(() => {
    jest.resetModules();
    (global as unknown as { __sockets: unknown[] }).__sockets = [];
    process.env['GROK_API_KEY'] = 'test-key';
    process.env['VOICE_TRIGGER_WORD'] = 'evan';
  });

  const connect = async () => {
    const mod = await import('../grokVoiceAgent');
    const client = mod.createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() });
    const sock = (global as unknown as { __sockets: Sock[] }).__sockets[0];
    sock.emit('open');
    await flush();
    sock.serverSays({ type: 'session.updated' });
    return { client: client!, sock, mod };
  };

  it('commits and responds when the transcript starts with the wake word', async () => {
    const { client, sock } = await connect();
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
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: '  ...EVAN skip this song',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('does not treat a wake word mid-sentence as being addressed', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'I was talking to Evan yesterday',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('resets transcript state between utterances', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await client.endUtterance();
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(2);
  });

  it('accepts a cumulative transcript that arrives on the delta field', async () => {
    const { client, sock } = await connect();
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
    const sock = (global as unknown as { __sockets: Sock[] }).__sockets[0];
    sock.emit('open');
    await flush();
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(0);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @rainbot/pranjeet-worker test src/voice-agent/__tests__/grokVoiceAgent.wakeword.test.ts`
Expected: FAIL — `client.endUtterance` is not a function, `isAddressed` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `apps/pranjeet/src/voice-agent/grokVoiceAgent.ts`:

Add `VOICE_TRIGGER_WORD` to the config import:

```ts
import {
  GROK_API_KEY,
  GROK_ENABLED,
  GROK_VOICE,
  GROK_VOICE_AGENT_TOOLS,
  VOICE_TRIGGER_WORD,
} from '../config';
```

Add below `INPUT_TRANSCRIPTION_MODEL`:

```ts
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
```

Extend the client interface:

```ts
export interface GrokVoiceAgentClient {
  sendAudio(chunk: Buffer): void;
  /**
   * Called on Discord's silence boundary. Always commits the input buffer, then
   * requests a response ONLY if the wake word opened the utterance.
   */
  endUtterance(): Promise<void>;
  close(): void;
}
```

Alongside the other `let` declarations near `sessionConfigured`, add:

```ts
let inputTranscript = '';
```

In the `message` switch, add a case (the event type carries the cumulative text on `transcript`; fall back to `delta` in case xAI's field naming differs from the docs):

```ts
      case 'conversation.item.input_audio_transcription.updated': {
        const text =
          (event as { transcript?: string }).transcript ?? (event as { delta?: string }).delta;
        if (typeof text === 'string' && text.length > 0) inputTranscript = text;
        break;
      }
```

Widen the local `event` type in the same handler to include the new field:

```ts
let event: {
  type?: string;
  delta?: string;
  transcript?: string;
  response?: { id?: string };
  name?: string;
  call_id?: string;
  arguments?: string;
};
```

Add `endUtterance` to the returned object, above `close()`:

```ts
    async endUtterance() {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN || !sessionConfigured) return;
      // Commit unconditionally. If the server only transcribes committed audio,
      // gating the commit on the transcript would deadlock; commit merely closes
      // the input buffer and produces no reply on its own.
      send({ type: 'input_audio_buffer.commit' });
      if (!isAddressed(inputTranscript, VOICE_TRIGGER_WORD)) {
        await new Promise((r) => setTimeout(r, TRANSCRIPT_SETTLE_MS));
      }
      const addressed = isAddressed(inputTranscript, VOICE_TRIGGER_WORD);
      if (addressed) {
        send({ type: 'response.create' });
      } else {
        log.debug(`Utterance not addressed (no wake word); staying silent`);
      }
      inputTranscript = '';
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @rainbot/pranjeet-worker test src/voice-agent/__tests__/grokVoiceAgent.wakeword.test.ts`
Expected: PASS, 10 tests. The two "stays silent" cases each take ~300ms because they wait out the settle window.

- [ ] **Step 5: Commit**

```bash
git add apps/pranjeet/src/voice-agent/grokVoiceAgent.ts apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.wakeword.test.ts
git commit -m "feat(pranjeet): gate Grok's reply on a wake word at each utterance boundary"
```

---

### Task 5: Wire the utterance boundary through the voice manager

Discord already tells us when an utterance ends; that signal currently does nothing in conversation mode because the STT buffer is empty. Route it to the client.

**Files:**

- Modify: `packages/protocol/src/types/voice-interaction.ts:78-81` (the `createVoiceAgentClient` return type)
- Modify: `packages/utils/src/voice/voiceInteractionManager.ts:88` (the client map type), `:260-278` (the `opusDecoder.on('end')` handler), plus a new public `onUtteranceEnd` method
- Modify: `apps/pranjeet/src/index.ts:134` — no code change needed, but re-verify it still type-checks against the widened return type
- Test: `packages/utils/src/voice/__tests__/voiceInteractionManager.utterance.test.ts` (create)

**Interfaces:**

- Consumes: `endUtterance(): Promise<void>` from Task 4.
- Produces: `VoiceInteractionManager.onUtteranceEnd(guildId: string, userId: string): Promise<void>` — looks up the cached voice-agent client for that key and calls `endUtterance()` if present. Testable without Discord receiver mocks, which is why the `end` handler delegates to it rather than inlining the lookup.

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/voice/__tests__/voiceInteractionManager.utterance.test.ts`:

```ts
import type { Client } from 'discord.js';
import { VoiceInteractionManager } from '../voiceInteractionManager';

const fakeClient = {} as Client;

/**
 * startListening throws unless the guild has state (enableForGuild creates it, no
 * I/O), and it dereferences connection.joinConfig.channelId then subscribes to
 * connection.receiver. The returned stream only needs .pipe() — nothing reads it
 * here. The manager's STT provider falls back to a mock when no key is set, so
 * constructing it without credentials is safe.
 */
const fakeConnection = () =>
  ({
    joinConfig: { channelId: 'c1' },
    receiver: { subscribe: () => ({ pipe: () => undefined }) },
    state: { status: 'ready' },
  }) as never;

/** Seed a voice-agent client by pushing one chunk through with conversation mode on. */
async function seed(endUtterance: jest.Mock) {
  const agent = { sendAudio: jest.fn(), close: jest.fn(), endUtterance };
  const mgr = new VoiceInteractionManager(fakeClient, {
    enabled: true,
    getConversationMode: async () => true,
    createVoiceAgentClient: () => agent,
  });
  await mgr.enableForGuild('g1');
  await mgr.startListening('u1', 'g1', fakeConnection());
  await mgr.processAudioChunk({
    guildId: 'g1',
    userId: 'u1',
    timestamp: Date.now(),
    buffer: Buffer.alloc(200),
    sequence: 0,
  });
  return { mgr, agent };
}

describe('onUtteranceEnd', () => {
  it('ends the utterance on the cached voice-agent client', async () => {
    const endUtterance = jest.fn().mockResolvedValue(undefined);
    const { mgr, agent } = await seed(endUtterance);
    expect(agent.sendAudio).toHaveBeenCalledTimes(1);
    await mgr.onUtteranceEnd('g1', 'u1');
    expect(endUtterance).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no voice-agent client exists for that user', async () => {
    const mgr = new VoiceInteractionManager(fakeClient, { enabled: true });
    await mgr.enableForGuild('g1');
    await expect(mgr.onUtteranceEnd('g1', 'nobody')).resolves.toBeUndefined();
  });

  it('swallows an endUtterance failure so the audio subscription survives', async () => {
    const endUtterance = jest.fn().mockRejectedValue(new Error('socket gone'));
    const { mgr } = await seed(endUtterance);
    await expect(mgr.onUtteranceEnd('g1', 'u1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn build:ts
yarn workspace @rainbot/utils test src/voice/__tests__/voiceInteractionManager.utterance.test.ts
```

Expected: FAIL — `mgr.onUtteranceEnd is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `packages/protocol/src/types/voice-interaction.ts`, widen the return type:

```ts
  createVoiceAgentClient?: (
    session: VoiceInteractionSession & { connection?: unknown }
  ) => {
    sendAudio(chunk: Buffer): void;
    /** Called on Discord's silence boundary; commits audio and decides whether to reply. */
    endUtterance?(): void | Promise<void>;
    close(): void;
  } | null;
```

In `packages/utils/src/voice/voiceInteractionManager.ts`, widen the map field:

```ts
  private voiceAgentClients: Map<
    string,
    { sendAudio(chunk: Buffer): void; endUtterance?(): void | Promise<void>; close(): void }
  >;
```

Add the public method next to `isListeningToUser`:

```ts
  /**
   * Discord's silence boundary for one user's utterance. In conversation mode the
   * STT buffer is empty, so this is the only signal the Voice Agent gets that the
   * user stopped talking — it is what turns the wake-word gate. A missing client
   * means conversation mode is off; a throwing one must not kill the audio
   * subscription, so failures are logged and swallowed.
   */
  async onUtteranceEnd(guildId: string, userId: string): Promise<void> {
    const client = this.voiceAgentClients.get(`${guildId}:${userId}`);
    if (!client?.endUtterance) return;
    try {
      await client.endUtterance();
    } catch (e) {
      log.warn(`endUtterance failed for ${guildId}:${userId}: ${(e as Error).message}`);
    }
  }
```

In the `opusDecoder.on('end')` handler, add the call before the existing buffer processing:

```ts
    opusDecoder.on('end', async () => {
      log.info(
        `Silence detected for user ${userId} - processing ${session.audioBuffer.length} chunks`
      );

      // Conversation mode: the buffer is empty by design (processAudioChunk
      // streams straight to xAI), so this boundary is the wake-word gate's turn
      // signal. Runs before the STT path, which is a no-op in that mode.
      await this.onUtteranceEnd(guildId, userId);

      if (session.audioBuffer.length > 0) {
        await this.processCompleteAudio(session);
      }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn build:ts
yarn workspace @rainbot/utils test src/voice/__tests__/voiceInteractionManager.utterance.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/types/voice-interaction.ts packages/utils/src/voice/voiceInteractionManager.ts packages/utils/src/voice/__tests__/voiceInteractionManager.utterance.test.ts
git commit -m "feat(voice): route Discord's silence boundary to the Voice Agent's wake-word gate"
```

---

### Task 6: Full validation and the server-VAD regression guard

**Files:**

- Test: `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.session.test.ts` (extend)

**Interfaces:**

- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.session.test.ts`, inside the existing `describe`:

```ts
it('never reintroduces server_vad anywhere in the session payload', async () => {
  const { sock } = await connect();
  const update = sock.sentOfType('session.update')[0];
  expect(JSON.stringify(update)).not.toContain('server_vad');
});
```

- [ ] **Step 2: Run it**

Run: `yarn workspace @rainbot/pranjeet-worker test src/voice-agent/__tests__/grokVoiceAgent.session.test.ts`
Expected: PASS (Task 3 already removed `server_vad`; this test exists so a revert fails here rather than in a voice channel).

- [ ] **Step 3: Run the full gate**

Run: `yarn validate`
Expected: PASS — type-check, format:check, and all Jest + Vitest suites.

If `format:check` fails, run `yarn format` and re-run `yarn validate`.

- [ ] **Step 4: Rebuild before any manual run**

```bash
yarn build:ts
```

Bots have no hot reload, and Raincloud's alias loader resolves only against `dist/`.

- [ ] **Step 5: Commit**

```bash
git add apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.session.test.ts
git commit -m "test(pranjeet): fail the build if server VAD returns to the session config"
```

---

## Deferred to a live check, not implementable here

`grok-transcribe` availability is unverified against the live account. Per the spec's open item: if `session.update` is rejected or no
`conversation.item.input_audio_transcription.updated` event ever arrives, **stop and report** rather than building the whisper
pre-gate fallback. That fallback costs roughly a second of added latency and a whisper call per utterance from everyone in the
channel, which is Connor's cost decision.

The first live check is the boot log plus one VC test: say something without the wake word (expect silence), then with it
(expect a reply of 10 words or fewer).
