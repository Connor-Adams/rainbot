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
- **Before the first test run in a fresh worktree:** `yarn && yarn build:ts` from the repo root. Invoking one workspace's jest directly does not build its `@rainbot/*` dependencies, and the suite imports them from `dist/`. Already done in this worktree at plan time; re-run `yarn build:ts` after editing anything under `packages/`.

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
import { buildVoiceInstructions, VOICE_BREVITY, VOICE_ACCENT_CRITICAL } from '../voice';

const wordCount = (s: string) => s.trim().split(/\s+/).length;

describe('buildVoiceInstructions', () => {
  it('states the 10-word cap and the 5-word target', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out).toContain('10 words');
    expect(out).toContain('5 words');
  });

  it('puts the brevity rule before the accent instruction', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    expect(out.indexOf(VOICE_BREVITY.trim())).toBeLessThan(out.indexOf(VOICE_ACCENT_CRITICAL));
  });

  it('keeps the accent instruction under 30 words at each end', () => {
    const out = buildVoiceInstructions('You are terse.', false);
    const accentLines = out.split('\n').filter((l) => /accent/i.test(l));
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

export const VOICE_ACCENT_CRITICAL =
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

- Produces (test-only): `./helpers/fakeWs` exporting `MockWebSocket`, `wsModuleMock()`, `sockets()`, `resetSockets()`, `flush()`, and the `Sock` interface. Task 4 imports these rather than redefining them.

- [ ] **Step 1: Write the failing test**

First create the shared fake socket at `apps/pranjeet/src/voice-agent/__tests__/helpers/fakeWs.ts`. Task 4 reuses it. The socket registry lives on `global` on purpose: `jest.resetModules()` clears the module registry between cases, so module-level state would vanish along with it.

```ts
import { EventEmitter } from 'events';

/** The subset of the fake socket a test drives. */
export interface Sock {
  readyState: number;
  sent: Array<Record<string, unknown>>;
  emit(name: string, ...args: unknown[]): boolean;
  serverSays(event: Record<string, unknown>): void;
  sentOfType(type: string): Array<Record<string, unknown>>;
}

export class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];

  constructor() {
    super();
    (global as unknown as { __sockets: unknown[] }).__sockets.push(this);
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }
  ping() {}
  close() {
    this.readyState = 3;
  }
  /** Drive the client as the xAI server would. */
  serverSays(event: Record<string, unknown>) {
    this.emit('message', Buffer.from(JSON.stringify(event)));
  }
  sentOfType(type: string) {
    return this.sent.filter((e) => e['type'] === type);
  }
}

/** `ws` is imported as a default export, so the mock module must mirror that. */
export function wsModuleMock() {
  return { __esModule: true, default: MockWebSocket };
}

export const sockets = () => (global as unknown as { __sockets: Sock[] }).__sockets;
export const resetSockets = () => {
  (global as unknown as { __sockets: unknown[] }).__sockets = [];
};
/** Flush the microtask queue so the async IIFE in the 'open' handler completes. */
export const flush = () => new Promise((r) => setImmediate(r));
```

Jest's `testMatch` is `**/__tests__/**/*.ts`, so this helper would otherwise be collected as a suite and fail with "must contain at least one test". Add the ignore to `apps/pranjeet/jest.config.js`:

```js
  testPathIgnorePatterns: ['/dist/', '/node_modules/', '/__tests__/helpers/'],
```

Then create `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.session.test.ts`.

```ts
jest.mock('ws', () =>
  jest.requireActual<typeof import('./helpers/fakeWs')>('./helpers/fakeWs').wsModuleMock()
);

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

import { flush, resetSockets, sockets } from './helpers/fakeWs';

describe('Voice Agent session config', () => {
  beforeEach(() => {
    jest.resetModules();
    resetSockets();
    process.env['GROK_API_KEY'] = 'test-key';
    process.env['VOICE_TRIGGER_WORD'] = 'evan';
  });

  const connect = async () => {
    const { createGrokVoiceAgentClient } = await import('../grokVoiceAgent');
    const client = createGrokVoiceAgentClient('g1', 'u1', { onAudioDone: jest.fn() });
    const sock = sockets()[0];
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

- Consumes: `INPUT_TRANSCRIPTION_MODEL` and the session shape from Task 3; the `./helpers/fakeWs` test helper from Task 3; `VOICE_TRIGGER_WORD` from `../config`.
- Produces: `GrokVoiceAgentClient` gains `endUtterance(): Promise<void>`. Also exports `TRANSCRIPT_SETTLE_MS = 300` and `isAddressed(transcript: string, triggerWord: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/pranjeet/src/voice-agent/__tests__/grokVoiceAgent.wakeword.test.ts`. It reuses Task 3's `./helpers/fakeWs`. The `jest.mock` factory body runs lazily, so requiring the helper from inside it is safe despite the call being hoisted.

```ts
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
    // Minor 2 (round 2) means a boundary only commits when audio was
    // actually appended for it — append audio before each boundary, as
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
    const sock = sockets()[0];
    sock.emit('open');
    await flush();
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(0);
  });

  it('accepts a transcript that arrives inside the settle window (not just before endUtterance)', async () => {
    const { client, sock } = await connect();
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
    await Promise.all([p1, p2]);
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(2);
    expect(sock.sentOfType('response.create')).toHaveLength(0);
  });

  it('opens the gate on a "completed" transcription event the same way "updated" does', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Evan skip this',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('appends (not replaces) a sequence of "delta" transcription events', async () => {
    const { client, sock } = await connect();
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'Evan',
    });
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: ' play something',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);
  });

  it('warns once per client when no transcription event ever arrives, naming the configured model', async () => {
    const { client, mod } = await connect();
    // Minor 1 (round 2): the warning is gated on audio actually having been
    // appended for the utterance — a silent boundary with no speech is not
    // evidence the wake-word gate is dead.
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

  it('does not re-arm the transcript slot on a session.updated re-ack after a reply, so a later utterance cannot inherit a late transcript (CRITICAL regression, round 2)', async () => {
    const { client, sock } = await connect();
    // Utterance A: addressed, produces the one legitimate reply.
    client.sendAudio(Buffer.alloc(20));
    sock.serverSays({
      type: 'conversation.item.input_audio_transcription.updated',
      transcript: 'Evan hello',
    });
    await client.endUtterance();
    expect(sock.sentOfType('response.create')).toHaveLength(1);

    // The reply triggers response.created, which re-sends session.update;
    // the server acks it with a SECOND session.updated. This must not
    // reopen the transcript slot (that is the whole point of the fix).
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

  it("does not let the next utterance's wake-word transcript answer for the one still settling (IMPORTANT regression, round 2)", async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    // Utterance 1 has no transcript of its own; start ending it (it enters
    // its settle window and does not resolve yet).
    const pending = client.endUtterance();
    // Flush so run() actually starts (sends its commit and marks itself as
    // awaiting the next utterance's audio) before utterance 2's audio
    // arrives — endUtterance() only queues onto the chain synchronously; the
    // chained run() itself begins on a later microtask.
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
  });

  it("does not let a straggler .delta from a finished utterance become the head of the next utterance's transcript", async () => {
    const { client, sock } = await connect();
    client.sendAudio(Buffer.alloc(20));
    // Utterance 1 finishes with no transcript of its own; the slot disarms.
    await client.endUtterance();
    // A straggler .delta for utterance 1 arrives after it already decided
    // and must be dropped rather than seed the next utterance's slot.
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

  it('sends no commit for a boundary with no audio appended, but does for one with audio (Minor 2, round 2)', async () => {
    const { client, sock } = await connect();
    // No audio at all before this boundary.
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(0);

    // Audio arrives before the next boundary.
    client.sendAudio(Buffer.alloc(20));
    await client.endUtterance();
    expect(sock.sentOfType('input_audio_buffer.commit')).toHaveLength(1);
  });

  it('does not fire the no-transcription warning for a boundary with no audio appended (Minor 1, round 2)', async () => {
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
   * Called on Discord's silence boundary. Commits the input buffer whenever
   * audio was appended since the last commit, then requests a response ONLY
   * if the wake word opened the utterance.
   */
  endUtterance(): Promise<void>;
  close(): void;
}
```

(The doc comment above reflects the round-2 Minor 2 fix — see the second post-review callout
below; the original minimal implementation said "Always commits the input buffer".)

Alongside the other `let` declarations near `sessionConfigured`, add:

```ts
let inputTranscript = '';
// Owns the transcript slot for the window between the session's FIRST
// session.updated (or a reply completing and a fresh utterance starting)
// and the current utterance's endUtterance() capturing its decision. Armed
// once by the first session.updated (see that case below — later re-acks,
// sent after every response.created/response.done, must NOT re-arm here,
// or a late transcript for the utterance that just replied would be
// readable by the very next utterance). Re-armed per-utterance by
// sendAudio. Disarmed once endUtterance()'s decision is captured. While
// disarmed, incoming transcription events are dropped instead of being
// inherited by whichever utterance opens next.
let acceptingTranscript = false;
// Identifies which utterance currently owns the transcript slot. Bumped by
// sendAudio whenever it starts a new utterance. acceptingTranscript alone
// cannot tell "late text belonging to the utterance that just decided"
// apart from "early text belonging to the utterance that just started" when
// the two overlap — Discord's per-user boundaries are not guaranteed to
// arrive in order relative to sendAudio (processAudioChunk in
// packages/utils/src/voice/voiceInteractionManager.ts awaits a Redis call
// before reaching sendAudio and is fire-and-forget from the audio `data`
// handler). A decision in endUtterance() only ever uses text stamped with
// its own sequence number; this guard and acceptingTranscript cover
// different windows and both stay in place.
let utteranceSeq = 0;
let transcriptSeq = -1;
// Set the instant a commit is sent (before the settle wait, not after it),
// and consumed by the very next sendAudio call regardless of whether
// acceptingTranscript has been disarmed yet. This is what lets a NEW
// utterance's audio bump the sequence even while the PREVIOUS utterance is
// still inside its settle window — acceptingTranscript alone cannot do
// this, since it only flips false once that previous utterance's decision
// is already made (same synchronous step). Reset alongside the other slot
// state once a run's own decision is captured, so it cannot linger and
// enable a bump long after the fact (which would mask the case where a
// stale acceptingTranscript is the actual bug being guarded against).
let awaitingNextUtteranceAudio = false;
// Whether any audio has actually been appended for the current utterance.
// Gates two things: the commit (an empty commit just produces a server
// `error` event and log noise for a queued/duplicate boundary) and the
// "no transcription event ever arrived" diagnostic (a boundary with no real
// speech is not evidence the wake-word gate is dead).
let audioAppendedThisUtterance = false;
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
```

> **Post-review redesign.** A review of the initial minimal implementation (above three fields
> plus a straight-line `endUtterance`) found two Critical fail-open paths: (1) `inputTranscript`
> was one unversioned slot, so a transcript that arrived late — after its owning utterance had
> already decided and cleared it — was inherited by the _next_ utterance's decision; (2) nothing
> serialized `endUtterance()`, so two overlapping calls (Task 5's `opusDecoder.on('end')` gives
> every Discord speaking stream its own decoder) could both read the same slot and both reply.
> `acceptingTranscript` and `endUtteranceChain` above are the fix — transcript ownership and call
> serialization.

> **Post-review redesign, round 2.** A second review found the round-1 `acceptingTranscript` flag
> still had one Critical hole and one Important weakness, plus four Minors:
>
> - **Critical** — `sendSessionUpdate()` is re-sent on `response.created` and `response.done`, so
>   the server acks `session.updated` again after every single reply. The round-1
>   `session.updated` case armed `acceptingTranscript` unconditionally on every ack, reopening the
>   slot right after a decision had cleared it — a late transcript for the utterance that just
>   replied could then be inherited by the very next (unaddressed) utterance. Fixed by arming only
>   on the first ack (guarded on `sessionConfigured` not yet being true) and leaving all later
>   re-arming to `sendAudio`.
> - **Important** — the arm/disarm boolean alone carries no per-utterance identity: it cannot tell
>   "late text belonging to the utterance that just decided" from "early text belonging to the
>   utterance that just started" when the two overlap in time (Discord boundaries are not
>   guaranteed to arrive in order relative to `sendAudio`, see the comment on `utteranceSeq`
>   above). Fixed by stamping every transcript write with `utteranceSeq` (`transcriptSeq`), so a
>   decision in `endUtterance()` only ever uses text written for its own sequence number.
>   `acceptingTranscript` stays in place — the two guards cover different windows.
> - **Minor 1** — the warn-once diagnostic could fire falsely (and permanently latch) on a
>   boundary with no real speech. Fixed by gating it on `audioAppendedThisUtterance`.
> - **Minor 2** — a queued or duplicate boundary committed an empty input buffer, which the
>   realtime protocol answers with an `error` event (log noise). Fixed by tracking whether audio
>   was appended since the last commit and skipping the commit when none was — this does not
>   weaken the "commit unconditionally" rule, which is about never gating the commit on the
>   transcript.
> - **Minor 3** — the settle-window timer was not cancellable, so `doClose()` left every pending
>   and queued `endUtterance()` waiting out its full 300ms, dragging out eviction and shutdown.
>   Fixed with `pendingSettleTimer`/`pendingSettleResolve` (see `settleWait()` above) and clearing
>   both in `doClose()`.
> - **Minor 4** — `async` on the returned `endUtterance()` was redundant (it only assigns into the
>   chain and returns it). Dropped, with a comment noting N queued boundaries make the caller wait
>   N × the settle window.
>
> The snippets below reflect the round-2 shipped version.

Arm `acceptingTranscript` only on the FIRST `session.updated` ack — see the Critical fix above:

```ts
      case 'session.updated':
        // Arm ONLY on the first ack. sendSessionUpdate() is re-sent on every
        // response.created/response.done, so the server acks session.updated
        // again after every single reply — re-arming here unconditionally
        // would reopen the transcript slot right after a decision cleared it,
        // letting that utterance's own late transcript (or worse, feed a
        // later unaddressed utterance) back in. All re-arming after the first
        // ack is sendAudio's job, per-utterance (see CRITICAL fix history).
        if (!sessionConfigured) acceptingTranscript = true;
        sessionConfigured = true;
        log.debug('Voice Agent session.updated');
        break;
```

In the `message` switch, add cases for all three transcription event spellings xAI might use — the
docs only confirm `.updated`, so `.completed` (also cumulative) and `.delta` (incremental — must
append, not replace, or a wake word at the head of the utterance gets overwritten by a later
fragment) are handled defensively. `event` already declares both `transcript` and `delta` as
optional strings, so no `as` casts are needed to read them. Both cases ignore text while
`acceptingTranscript` is false — this is what closes the late-transcript bug, dropping a transcript
that arrives after its utterance has already decided instead of leaving it for the next one to
inherit. Every write also stamps `transcriptSeq = utteranceSeq` (the Important fix above); a
`.delta` only appends when the slot already belongs to the current sequence, otherwise it starts
fresh rather than gluing onto a different utterance's words:

```ts
      case 'conversation.item.input_audio_transcription.updated':
      case 'conversation.item.input_audio_transcription.completed': {
        // The exact event name xAI emits is unverified against the docs; handle
        // both spellings. Both carry cumulative (not incremental) text, so we
        // replace rather than append.
        hasReceivedTranscriptionEvent = true;
        const text = event.transcript ?? event.delta;
        if (acceptingTranscript && typeof text === 'string' && text.length > 0) {
          inputTranscript = text;
          transcriptSeq = utteranceSeq;
        }
        break;
      }
      case 'conversation.item.input_audio_transcription.delta': {
        // Unlike .updated/.completed, a .delta carries an incremental fragment
        // — appending (not replacing) is what keeps the wake word at the head
        // of the utterance from being overwritten by a later fragment. But
        // appending is only correct when the existing slot content already
        // belongs to the current utterance; a delta arriving while the slot
        // still holds a different sequence's text must start fresh instead of
        // gluing itself onto someone else's words.
        hasReceivedTranscriptionEvent = true;
        const text = event.transcript ?? event.delta;
        if (acceptingTranscript && typeof text === 'string' && text.length > 0) {
          if (transcriptSeq === utteranceSeq) {
            inputTranscript += text;
          } else {
            inputTranscript = text;
            transcriptSeq = utteranceSeq;
          }
        }
        break;
      }
```

The local `event` type in the same handler already declares both fields (`transcript?: string`,
`delta?: string`), so it needs no widening.

In `sendAudio`, re-arm when disarmed, OR when a commit was already sent for the current utterance
(`awaitingNextUtteranceAudio` — round 2's Important fix, letting a still-settling previous
utterance's boundary get bumped past even before it has disarmed):

```ts
    sendAudio(chunk: Buffer) {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN || !sessionConfigured) return;
      // Re-arm only when disarmed, so mid-utterance chunks don't wipe
      // accumulated transcript text — this is what lets a fresh utterance
      // start accepting transcripts again after the previous one decided.
      // Bumping utteranceSeq HERE (not in endUtterance) is what lets a
      // still-settling run() detect that a new utterance has already started
      // (see utteranceSeq/transcriptSeq above). Also re-arms when a commit
      // was already sent for the current utterance (awaitingNextUtteranceAudio),
      // even if acceptingTranscript itself hasn't been disarmed yet — this is
      // the case where the PREVIOUS utterance's endUtterance() is still
      // inside its settle window when this new audio arrives.
      if (!acceptingTranscript || awaitingNextUtteranceAudio) {
        acceptingTranscript = true;
        inputTranscript = '';
        utteranceSeq += 1;
        audioAppendedThisUtterance = false;
        awaitingNextUtteranceAudio = false;
      }
      if (chunk.length <= 10) return;
      audioAppendedThisUtterance = true;
      const resampled = resample48kStereoTo24kMono(chunk);
      const b64 = resampled.toString('base64');
      send({ type: 'input_audio_buffer.append', audio: b64 });
    },
```

Add `endUtterance` to the returned object, above `close()`. It serializes via `endUtteranceChain`
and decides on a captured local (`transcript`), disarming _after_ the settle window so a transcript
arriving inside the window still counts for this utterance while anything later is dropped until
new audio re-arms. Round 2 adds: `seq`/`hadAudio` captured up front, the commit and warn-diagnostic
gated on `hadAudio` (Minors 1 and 2), the decision gated on `transcriptSeq === seq` (Important fix),
and the disarm itself guarded on `seq === utteranceSeq` so a stale run can't stomp on a newer
utterance's already-in-progress state:

```ts
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
        const hadAudio = audioAppendedThisUtterance;
        // Commit unconditionally whenever audio was appended. If the server
        // only transcribes committed audio, gating the commit on the
        // transcript would deadlock; commit merely closes the input buffer
        // and produces no reply on its own. But a boundary with nothing
        // appended (a queued or duplicate boundary) would commit an empty
        // buffer, which the realtime protocol answers with an `error` event —
        // pure log noise, so skip the commit in that case only.
        if (hadAudio) {
          send({ type: 'input_audio_buffer.commit' });
          // Set BEFORE the settle wait: a commit having been sent means any
          // audio arriving from here on belongs to a new utterance, even if
          // this run hasn't decided (and disarmed) yet.
          awaitingNextUtteranceAudio = true;
        }
        // Unconditional: a cumulative partial that happens to already match
        // (e.g. "Evan" mid-word on "Evanescence") must not short-circuit the
        // wait for the final text.
        await settleWait();
        // Only ever use text stamped for THIS utterance. A later utterance
        // may already have bumped utteranceSeq and be writing its own text
        // into the slot while this one was still waiting — that text is not
        // ours, so treat it as silence rather than read it.
        const transcript = transcriptSeq === seq ? inputTranscript : '';
        // Disarm AFTER the settle window: a transcript arriving inside the
        // window still counts for this utterance; anything later is dropped
        // until new audio re-arms (sendAudio) for the next one. Guarded on
        // seq still being current: if a NEXT utterance already started while
        // this one was settling (sendAudio bumps utteranceSeq), that next
        // utterance owns the slot now — clearing it here would stomp on
        // text it has already started writing.
        if (seq === utteranceSeq) {
          acceptingTranscript = false;
          inputTranscript = '';
          awaitingNextUtteranceAudio = false;
        }
        if (hadAudio && !hasReceivedTranscriptionEvent && !warnedNoTranscription) {
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
```

Finally, add the settle-timer cancellation (Minor 3) to `doClose()`:

```ts
if (pendingSettleTimer) {
  clearTimeout(pendingSettleTimer);
  pendingSettleTimer = null;
}
if (pendingSettleResolve) {
  const resolve = pendingSettleResolve;
  pendingSettleResolve = null;
  resolve();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @rainbot/pranjeet-worker test src/voice-agent/__tests__/grokVoiceAgent.wakeword.test.ts`
Expected: PASS, 21 tests. The original 10, plus six added during the round-1 post-review fix pass
(the settle-window pickup, the Critical 1 and Critical 2 regressions, the `.completed` event,
`.delta` appending, and the warn-once diagnostic), plus five added during round 2 (the CRITICAL
session.updated-re-arm regression, the IMPORTANT next-utterance-transcript regression, the
straggler-`.delta`-must-not-become-head case, and the Minor 1/Minor 2 no-audio-boundary cases).
Several cases each take ~300ms because they wait out the settle window.

Three mutation checks confirm the round-2 fixes are load-bearing (each reverted immediately after
running): restoring the unconditional `acceptingTranscript = true` in `session.updated` fails only
the CRITICAL regression test; removing the `transcriptSeq === seq` check in `run()` fails only the
IMPORTANT regression test; removing the `hadAudio` guard on the commit fails only the Minor 2
no-commit-without-audio test.

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
