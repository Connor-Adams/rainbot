---
name: Fix NowPlayingCard setState-in-effect
overview: Resolve react-hooks/set-state-in-effect lint errors and missing dependency in NowPlayingCard by replacing prop-syncing effects with the "adjusting state when props change" pattern during render, and ensure yarn validate passes.
todos:
  - id: "1"
    content: "Replace two useEffects with during-render state adjustment (trackKey + positionMs)"
    status: pending
  - id: "2"
    content: "Run yarn validate and fix any failures (type-check, format, tests)"
    status: pending
  - id: "3"
    content: "Run yarn workspace @rainbot/ui lint and fix any remaining lint issues"
    status: pending
isProject: false
---

# Fix NowPlayingCard setState-in-effect and ensure yarn validate passes

## Problem

1. **Lines 42–44**: `useEffect` runs when `trackKey` changes and calls `setCurrentTime(initialPosition)` synchronously in the effect body → lint error and possible cascading renders.
2. **Lines 75–78**: `useEffect` runs when `queueData.positionMs` or `trackKey` changes and calls `setCurrentTime(queueData.positionMs / 1000)` synchronously → same lint error.
3. **Line 45**: First effect's dependency array is missing `initialPosition` → exhaustive-deps warning.

The rule allows setState only in **callbacks** (e.g. from subscriptions or timers), not synchronously in the effect body. The interval effect (lines 80–93) is fine because `setCurrentTime` is called inside the `setInterval` callback.

## Approach

Use React's **"adjusting state when props change"** pattern: update state **during render** when we detect that `trackKey` or `queueData.positionMs` changed, using refs to store previous values. That way we never call setState inside an effect for these two cases.

- [React: You might not need an effect – Adjusting some state when a prop changes](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)

## Implementation

**File:** [ui/src/components/NowPlayingCard.tsx](ui/src/components/NowPlayingCard.tsx)

1. **Remove the first effect** (lines 41–44, "Reset position when track changes").
2. **Remove the second effect** (lines 73–78, "Sync position when API sends new positionMs").
3. **Add "adjust state during render" logic** after the refs and before the mutations:
   - Keep `trackKeyRef` and use it in the interval callback as today.
   - Add a ref to store the previous `queueData.positionMs` (e.g. `prevPositionMsRef`).
   - In the render path:
     - If `prevTrackKeyRef.current !== trackKey`: set `trackKeyRef.current = trackKey`, `prevTrackKeyRef.current = trackKey`, and `setCurrentTime(initialPosition)`.
     - Else if `queueData.positionMs != null && queueData.positionMs >= 0` and `prevPositionMsRef.current !== queueData.positionMs`: set `prevPositionMsRef.current = queueData.positionMs` and `setCurrentTime(queueData.positionMs / 1000)`.
   - Check track change first, then positionMs, so we don't run position sync right after a track reset.
4. **Keep the interval effect** (lines 80–93) unchanged; it already calls setState only inside the timer callback.
5. **Dependencies**: No effect left that depends on `initialPosition`, so the missing-dependency warning goes away.

## Verification: ensure yarn validate passes

Per project rules, work is not done until **`yarn validate`** passes. After implementing the above:

1. **Run `yarn validate`** from the repo root.
   - This runs: `yarn type-check && yarn format:check && yarn test`.
   - Fix any type-check, format, or test failures.
2. **Run `yarn workspace @rainbot/ui lint`** to confirm the React hooks / set-state-in-effect rules pass on the UI (lint is not part of `yarn validate` but is part of definition of done).
3. If anything fails, fix and re-run until both `yarn validate` and UI lint pass.

## Result

- No synchronous setState in any effect; the only setState in an effect is inside the interval callback (allowed).
- No dependency array missing `initialPosition`.
- Behavior preserved: position resets when the track changes, syncs when `queueData.positionMs` changes, and the progress bar still ticks and handles seek as before.
- `yarn validate` and UI lint both pass.
