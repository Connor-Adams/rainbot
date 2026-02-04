---
name: ""
overview: ""
todos: []
isProject: false
---

# Discord commands: consistent structure and importable components

## Overview

1. **Fix emoji rendering** — Replace UTF-8 mojibake in command files with correct Unicode (see mapping below).
2. **Unify reply shape** — Every command uses the same payload shape and helpers; no bare-string replies.
3. **Extract importable components** — Response builders, shared messages, and optional voice-guard wrapper so all commands look and behave consistently.

---

## 1. Emoji fix (unchanged from prior audit)

Replace corrupted sequences in source with correct Unicode. Affected files:

- [apps/raincloud/commands/voice/autoplay.js](apps/raincloud/commands/voice/autoplay.js) — `ðŸ"` → 🔁
- [apps/raincloud/commands/voice/vol.js](apps/raincloud/commands/voice/vol.js) — `ðŸ"Š` → 🔊, `1â€"100` → 1–100
- [apps/raincloud/commands/voice/voice-control.js](apps/raincloud/commands/voice/voice-control.js) — `âœ…` → ✅, `â€¢` → •
- [apps/raincloud/commands/voice/queue.js](apps/raincloud/commands/voice/queue.js) — `ðŸŽµ`, `â€¢`, `ðŸ"Š`, `ðŸ"‹`, `â€"` → 🎵, •, 🔊, 📋, —
- [apps/raincloud/commands/voice/pause.js](apps/raincloud/commands/voice/pause.js) — `â–¶ï¸`, `ðŸ'¡` → ▶️, 💡
- [apps/raincloud/commands/voice/leave.js](apps/raincloud/commands/voice/leave.js) — `ðŸ'‹` → 👋
- [apps/raincloud/commands/voice/join.js](apps/raincloud/commands/voice/join.js) — `ðŸ"Š`, `ðŸ'¡` → 🔊, 💡
- [apps/raincloud/commands/voice/skip.js](apps/raincloud/commands/voice/skip.js) — `â­ï¸`, `â–¶ï¸` → ⏭️, ▶️

---

## 2. Single reply shape

**Rule:** Every `interaction.reply()` / `editReply()` / `followUp()` uses an **object** `{ content?, embeds?, components?, flags? }`. No `reply('plain string')`.

- Success (public): `{ content }` or `{ content, components }` or `{ embeds, components }` — no `flags`.
- Error / user-only: `{ content, flags: MessageFlags.Ephemeral }`.
- Confirmations: `{ content, components?, flags: MessageFlags.Ephemeral }`.

Use **one set of helpers** so all commands build replies the same way.

---

## 3. Importable components to add

All live under [apps/raincloud/commands/utils/](apps/raincloud/commands/utils/). Commands stay CommonJS; new modules can be JS or TS (if TS, compile and require from `dist`).

### 3.1 Response builders (new: `responseBuilder.js`)

A single module that returns reply payloads. Every command imports from here (and optionally from `commandHelpers.js` for service/validation).


| Export                                                         | Purpose                                                  | Returns                                     |
| -------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `replySuccess(content, options?)`                              | Public success message                                   | `{ content, components? }`                  |
| `replyError(message, context?, tip?)`                          | Error (ephemeral); same as current `createErrorResponse` | `{ content, flags: Ephemeral }`             |
| `replyNotInVoice()`                                            | Standard "not in voice"                                  | `{ content, flags: Ephemeral }`             |
| `replyWorkerUnavailable()`                                     | Workers not ready                                        | `{ content, flags: Ephemeral }`             |
| `replyConfirm(content, components)`                            | Confirmation dialog (ephemeral)                          | `{ content, components, flags: Ephemeral }` |
| `replyPayload({ content?, embeds?, components?, ephemeral? })` | Generic builder; ephemeral → `flags`                     | Single shape for all replies                |


**Implementation notes:**

- `replyNotInVoice()` and `replyWorkerUnavailable()` centralize copy (and emoji). Same text everywhere: e.g. "❌ I'm not in a voice channel! Use `/join` first."
- `replySuccess(content, { components })` avoids ephemeral so success is public.
- Migrate existing `createWorkerUnavailableResponse` and `createErrorResponse` into this module (or re-export from commandHelpers for backward compatibility during refactor). Prefer one home: responseBuilder.

### 3.2 Shared message constants (optional: `commandMessages.js` or inside responseBuilder)

Centralize strings so copy and emoji are fixed in one place:

- `NOT_IN_VOICE` — "❌ I'm not in a voice channel! Use `/join` first."
- `WORKER_UNAVAILABLE` — "Error: worker services are not ready. Please try again in a moment."
- `NOTHING_PLAYING` — "❌ Nothing is playing right now. Use `/play` to start playback." (or variant per command)
- `TIP_JOIN_FIRST` — "Use `/join` first." (for reuse in short errors)

Then `replyNotInVoice()` uses `NOT_IN_VOICE`; any new command reuses the same text.

### 3.3 Voice guard wrapper (optional: `runVoiceCommand` in commandHelpers or responseBuilder)

Many voice commands repeat:

1. `const service = await getMultiBotService(); if (!service) return interaction.reply(replyWorkerUnavailable());`
2. `const status = await service.getStatus(guildId); if (!status || !status.connected) return interaction.reply(replyNotInVoice());`
3. `try { ... } catch (e) { return interaction.reply(replyError(e)); }`

Extract a helper so each command only implements the "happy path":

```js
// Optional: runVoiceCommand(interaction, async (service, status) => payload)
// - Gets service; replies worker unavailable and returns if null
// - Gets status; replies not in voice and returns if not connected
// - Calls fn(service, status); then interaction.reply(result) or editReply(result)
// - Wraps in try/catch and replyError
```

Commands that need **deferReply** (e.g. play, join) can either use a variant like `runVoiceCommandDeferred` or keep their current flow and only use the shared response builders. Recommendation: introduce response builders first, then add `runVoiceCommand` only if you want every voice command to share the exact same preamble.

### 3.4 Queue embed builder (optional: extract from queue.js)

[apps/raincloud/commands/voice/queue.js](apps/raincloud/commands/voice/queue.js) builds an embed + pagination in place. You can extract:

- `buildQueueEmbed(mediaState, queueState, pageIndex, guildId)` → `{ embed, components }` (or similar)

and keep queue.js as: guard → get data → `replyPayload({ embeds: [embed], components })`. That keeps the queue reply shape consistent with "always object with embeds/components" and makes the embed testable/reusable.

### 3.5 What stays in commandHelpers.js

- `getMultiBotService()` — unchanged.
- `validateVoiceConnection`, `checkVoicePermissions` — unchanged (or gradually replaced by runVoiceCommand if you add it).
- `formatDuration`, `getYouTubeThumbnail` — unchanged.
- `createErrorResponse` / `createWorkerUnavailableResponse` — either move to responseBuilder and re-export here, or keep here and have responseBuilder call them so all commands import from one place.

---

## 4. Standard command structure (target)

Every voice command that only needs "service + connected" should follow the same flow:

```text
1. service = await getMultiBotService()
2. if (!service) return interaction.reply(replyWorkerUnavailable())
3. status = await service.getStatus(guildId)
4. if (!status || !status.connected) return interaction.reply(replyNotInVoice())
5. try:
     result = await service.doThing(...)
     return interaction.reply(replySuccess(...))   // or replyPayload({ embeds, components })
   catch (e):
     return interaction.reply(replyError(e, context?, tip?))
```

Commands that **defer** (play, join, voice-control enable/disable):

- Same guards where applicable, then `deferReply()` then `editReply(replySuccess(...))` or `editReply(replyError(...))`.

Commands that **don’t need voice** (ping, voice-control for status):

- Use only `replyPayload` / `replySuccess` / `replyError` so the reply shape is still consistent.

---

## 5. Refactor checklist

- Add [apps/raincloud/commands/utils/responseBuilder.js](apps/raincloud/commands/utils/responseBuilder.js) with: `replySuccess`, `replyError`, `replyNotInVoice`, `replyWorkerUnavailable`, `replyConfirm`, `replyPayload`.
- Centralize message strings (in responseBuilder or commandMessages.js) and fix emoji there once.
- Replace every ad-hoc `{ content: "❌ ...", flags: MessageFlags.Ephemeral }` with `replyNotInVoice()` or `replyError(...)`.
- Replace every `createWorkerUnavailableResponse()` with `replyWorkerUnavailable()` (or make them the same function).
- Replace every bare-string success reply with `replySuccess(content)` or `replyPayload({ content })`.
- In clear.js: use `replyConfirm` for the confirmation dialog and `MessageFlags.Ephemeral` instead of `ephemeral: true`; use `replySuccess` for "Cleared the queue" and `replyError` for failures.
- Optionally: add `runVoiceCommand(interaction, async (service, status) => payload)` and refactor voice commands to use it.
- Optionally: extract queue embed building into a `buildQueueEmbed`-style helper and have queue.js use `replyPayload({ embeds, components })`.
- Fix all emoji in the eight command files (and any shared messages) so Discord renders them correctly.
- Run `yarn validate` after changes.

---

## 6. File layout after refactor

```text
apps/raincloud/commands/
  utils/
    commandHelpers.js    # getMultiBotService, formatDuration, getYouTubeThumbnail, checkVoicePermissions
    responseBuilder.js   # replySuccess, replyError, replyNotInVoice, replyWorkerUnavailable, replyConfirm, replyPayload
    (optional) commandMessages.js  # NOT_IN_VOICE, WORKER_UNAVAILABLE, ...
  voice/
    join.js             # uses responseBuilder + same structure
    leave.js
    play.js
    pause.js
    stop.js
    skip.js
    queue.js            # uses responseBuilder + optional buildQueueEmbed
    np.js
    vol.js
    clear.js
    autoplay.js
    voice-control.js
  utility/
    ping.js             # uses replyPayload({ embeds }) for consistency
```

All commands will look consistent: same reply shape, same guards (where applicable), and shared importable components for responses and messages.