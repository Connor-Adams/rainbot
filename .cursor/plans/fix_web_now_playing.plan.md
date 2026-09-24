---
name: Fix web now playing
overview: Fix now-playing display and improve play-state tracking (single contract, position, SSE).
todos:
  - id: '1'
    content: 'Part 1: Fix normalizeQueueState to accept object nowPlaying'
    status: completed
  - id: '2'
    content: 'Part 2.1: Single contract – align voice types, document worker contract'
    status: completed
  - id: '3'
    content: 'Part 2.2: Simplify coordinator normalizeQueueState (prefer object nowPlaying)'
    status: completed
  - id: '4'
    content: 'Part 2.3: Expose playback position from API and use in UI'
    status: completed
  - id: '5'
    content: 'Part 2.4: Add SSE for now-playing (events only on state change)'
    status: completed
  - id: '6'
    content: 'Verification: Run yarn validate and fix any failures'
    status: completed
isProject: false
---

# Fix web "now playing" and improve play-state tracking

## Part 1: Immediate fix (web now playing not displaying)

### Root cause

The UI only renders the Now Playing card when `queueData?.nowPlaying` is truthy ([PlayerTab.tsx](ui/src/components/tabs/PlayerTab.tsx) line 119). The data comes from `GET /api/queue/:guildId`, which returns the result of [workerCoordinator.getQueue](apps/raincloud/lib/workerCoordinator.ts) after [normalizeQueueState](apps/raincloud/lib/workerCoordinator.ts).

In **normalizeQueueState** (lines 66–92), `nowPlaying` is set only when:

1. `record['currentTrack']` is an object, or
2. `record['nowPlaying']` is a **string** (then converted to `{ title: record['nowPlaying'] }`).

The **rainbot worker** returns a [QueueResponse](packages/worker-protocol/src/types.ts) with `nowPlaying` as an **object** ([QueueItemPayload](packages/worker-protocol/src/types.ts): `{ title?, url?, duration?, ... }`) and does **not** send `currentTrack`. So the coordinator drops `nowPlaying`, the API returns none, and the UI never shows the card.

### Fix

Update **normalizeQueueState** in [apps/raincloud/lib/workerCoordinator.ts](apps/raincloud/lib/workerCoordinator.ts) so that `nowPlaying` is also set when `record['nowPlaying']` is a non-null **object**:

- If `record['nowPlaying']` is an object (and not null), use it as `QueueState['nowPlaying']`.
- If it's a string, keep `{ title: record['nowPlaying'] }`.
- Otherwise leave `nowPlaying` from `currentTrack` only (or undefined).

No UI or worker changes required for this fix.

---

## Part 2: Play-state tracking system improvements

The way play state is tracked and passed across worker → orchestrator → API → UI is fragmented and should be tightened up. Add this as follow-up work after the immediate fix.

### Current issues

1. **Multiple, inconsistent type definitions**

- [packages/protocol/src/types/media.ts](packages/protocol/src/types/media.ts): canonical `QueueState` with `nowPlaying?: MediaItem` (object).
- [packages/worker-protocol/src/types.ts](packages/worker-protocol/src/types.ts): RPC `QueueResponse` / `QueueItemPayload` (object).
- [apps/raincloud/types/voice.ts](apps/raincloud/types/voice.ts): local `QueueInfo` with `nowPlaying: string | null` and `currentTrack?: Track | null` — **different** from protocol (string vs object).
- [apps/raincloud/lib/multiBotService.ts](apps/raincloud/lib/multiBotService.ts): defines `QueueInfo = QueueState` (protocol), so raincloud uses two different QueueInfo concepts depending on file.

2. **Coordinator normalization is a "guess at shapes" layer**

- [normalizeQueueState](apps/raincloud/lib/workerCoordinator.ts) has to handle: `currentTrack` (object), `nowPlaying` (string **or** object), `isPaused` vs `paused`, `autoplay` vs `isAutoplay`. That's why the worker's object `nowPlaying` was dropped — the code only handled string.
- No single, documented contract: "Worker MUST return X; coordinator produces Y."

3. **Playback position and timing**

- Worker has `positionMs` / `durationMs` in playback state; API queue response doesn't expose a canonical "position now" for the UI.
- UI [simulates progress with setInterval](ui/src/components/NowPlayingCard.tsx) (e.g. +1s every second) instead of using server-reported position, so it can drift after seeks or network delays.

4. **Polling instead of real-time**

- UI uses `refetchInterval: 5000` for queue; no WebSocket/SSE for "now playing" or queue updates, so the dashboard can be up to 5s stale.

### Recommended follow-up work (in order)

1. **Single contract for queue/now-playing**

- Decide one canonical shape for "queue + now playing" (e.g. protocol `QueueState` + `MediaItem`).
- Document in worker-protocol (or a shared doc): "getQueue returns QueueResponse with `nowPlaying` as QueueItemPayload (object) and optional `positionMs`/`durationMs` if needed."
- Align [apps/raincloud/types/voice.ts](apps/raincloud/types/voice.ts) `QueueInfo` with that (or remove and use `@rainbot/protocol` / `@rainbot/types` only) so there's one definition for "queue info" across raincloud.

2. **Simplify coordinator normalization**

- After the contract is clear, make normalizeQueueState accept only the worker's actual response shape (object `nowPlaying`, no legacy `currentTrack`/string `nowPlaying` unless a legacy worker exists).
- If all workers send the same shape, normalization can be a thin pass-through plus renames (e.g. `paused` → `isPaused`) instead of multiple branches.

3. **Expose playback position from API**

- Have getQueue (or a small playback-state endpoint) include current position (e.g. `positionMs` / `durationMs` or seconds) when something is playing.
- UI: use that for the progress bar and optional "time remaining," and optionally still tick locally for smooth UX without polling every second.

4. **Real-time updates (WS or SSE) — only active when something is playing**

- Use WebSocket or SSE from orchestrator to dashboard for proper now playing (queue/now-playing/position changes). Real-time is the right approach; polling alone is not sufficient for a good now-playing experience.
- **Reduce overhead:** Keep the real-time channel active only when something is playing:
  - **Option A (recommended):** Client opens SSE (or WS) when the user is on the Player tab (or has a guild selected). Server **only sends events when playback state actually changes** (track started, paused, seeked, queue updated, stopped). No heartbeats or position ticks when idle. When nothing is playing, the stream stays open but silent — minimal server work.
  - **Option B:** Server only accepts or maintains the stream for connections that have at least one guild with active playback; when all subscribed guilds go idle, server closes the stream or stops sending until the client re-subscribes (e.g. after a play action or poll). Client may need a lightweight poll or one-off request to discover "something started playing" before opening the stream again.
- Prefer SSE for simplicity (one-way, auth via cookies, auto-reconnect). Use WS only if you need bidirectional or more complex framing.
- Events to send: `queue` (full snapshot or diff), `nowPlaying` (track + position/duration), `paused`, `seeked`, `stopped`. Position can be sent on each state-change event (so UI has current position without a separate position stream).

### Out of scope for this plan

- Changing worker playback logic or RPC method signatures (only clarify and document contracts).
- Full rewrite of raincloud voice types (incremental alignment is enough for now).

---

## Verification (Part 1)

After the immediate fix:

1. Start orchestrator and rainbot worker, play something in a guild.
2. Open dashboard, select that guild, Player tab — Now Playing card should appear when music is playing.
3. Run `yarn validate`.

---

## Double-check: full implementation (no mocks)

Verified that all plan items are real implementations, not stubs or mocks:

| Item                                 | Implementation                                                                                                                                                                                                                                                                           | Location                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Part 1 & 2.2** normalizeQueueState | Real: prefers object `nowPlaying`, passes through `positionMs`/`durationMs`, legacy fallbacks for `currentTrack`/string                                                                                                                                                                  | [workerCoordinator.ts](apps/raincloud/lib/workerCoordinator.ts)                                                      |
| **Part 2.1** Single contract         | Real: `QueueInfo`/`Track` from `@rainbot/types/media`; worker-protocol comment + `positionMs`/`durationMs` on `QueueResponse`                                                                                                                                                            | [voice.ts](apps/raincloud/types/voice.ts), [worker-protocol types](packages/worker-protocol/src/types.ts)            |
| **Part 2.3** Position from worker    | Real: `getPlaybackPosition(state)` uses `playbackStartTime`, `totalPausedTime`, `pauseStartTime`; `buildPlaybackState` returns `positionMs`/`durationMs`; `handleGetQueue` adds them when `state.currentTrack`                                                                           | [rainbot index.ts](apps/rainbot/src/index.ts)                                                                        |
| **Part 2.3** Position in API/UI      | Real: coordinator passes through; protocol `QueueState` and UI `QueueData` have `positionMs`/`durationMs`; NowPlayingCard uses `durationSeconds()`, `initialPosition` from `queueData.positionMs`, sync effect on `queueData.positionMs`                                                 | [workerCoordinator](apps/raincloud/lib/workerCoordinator.ts), [NowPlayingCard](ui/src/components/NowPlayingCard.tsx) |
| **Part 2.4** SSE server              | Real: `subscribersByGuild` Map, `addQueueSubscriber`/`broadcastQueueUpdate`; GET `/queue/:guildId/events` sets SSE headers, `flushHeaders`, `addQueueSubscriber`; `broadcastQueueUpdate(guildId, getQueue)` after play, soundboard, stop, skip, replay, pause, seek, clear (8 mutations) | [queueEvents.ts](apps/raincloud/server/sse/queueEvents.ts), [api.ts](apps/raincloud/server/routes/api.ts)            |
| **Part 2.4** SSE client              | Real: `useQueueEvents(guildId)` opens `EventSource(buildApiUrl(\`queue/${guildId}/events))`, onmessage parses JSON and` setQueryData(['queue', guildId], payload.data)`; PlayerTab calls` useQueueEvents(selectedGuildId ?? null)`                                                       | [useQueueEvents.ts](ui/src/hooks/useQueueEvents.ts), [PlayerTab.tsx](ui/src/components/tabs/PlayerTab.tsx)           |

- **DELETE /queue/:guildId/:index** (remove from queue) returns 501 "Remove track not supported in multi-bot mode yet" — no broadcast there until that feature is implemented; not a mock.
- **EventSource** does not send cookies cross-origin (browser limitation); same-origin or proxied API works with session auth.
