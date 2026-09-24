# Enabling conversational speaking (Grok Voice Agent)

Step-by-step flow to get **realtime** voice (Voice Agent WebSocket; no STT/TTS when this path is used) with Grok in Discord: your voice → Grok Voice Agent → Grok’s voice in the channel.

---

## 1. Prerequisites (environment / config)

### Raincloud (orchestrator)

- **REDIS_URL** – same Redis used by workers (required for conversation mode and voice state).
- Bot running and registered; workers (Pranjeet) reachable.

### Pranjeet (voice/TTS worker)

- **PRANJEET_TOKEN** – Discord bot token for the voice worker.
- **REDIS_URL** – must be set so Pranjeet can read:
  - `voice:interaction:enabled:{guildId}` (voice on for server)
  - `conversation:{guildId}:{userId}` (conversation mode on for you)  
    Without REDIS_URL, conversation mode and voice state are not shared with Raincloud.
- **GROK_API_KEY** or **XAI_API_KEY** – required for Grok (realtime Voice Agent and text chat).
- **VOICE_INTERACTION_ENABLED** – set to `true` if you want voice interaction on by default; otherwise it’s controlled per-guild via Redis (see below).
- **For the STT → Grok text → TTS path** (when the realtime Voice Agent isn’t used): set **OPENAI_API_KEY** or **STT_API_KEY** and **TTS_API_KEY** so speech-to-text and text-to-speech work instead of mock. If unset, you’ll see “Falling back to mock STT/TTS provider” and transcription/playback may be wrong or missing.
- Optional: **ORCHESTRATOR_BOT_ID** / **RAINCLOUD_URL** / **WORKER_SECRET** for multi-bot / auto-follow.

Pranjeet must be the bot that joins the voice channel where you want to talk to Grok (the one that runs voice/TTS and the Voice Agent).

---

## 2. Deploy Discord slash commands

So that `/chat` and `/voice-control` exist in your server:

- **From Discord:** use the deploy that your project uses (e.g. one-time or on deploy).
- **From Admin UI:** Dashboard → Admin → **Redeploy commands**.

---

## 3. Enable voice for the server (guild)

Voice listening is **per server**. It must be on for the guild or the bot will never start listening when you join.

**Option A – Discord**

- In the **same server** where you’ll use voice:
  - Run: **`/voice-control enable`**
  - (Requires “Manage Server”.)

**Option B – Admin UI (when turning on Grok)**

- When you turn on **Grok conversation mode** for a server in the Admin UI (step 4), the API **automatically enables voice for that server**.
- If you already had Grok conversation “On” before that change: turn it **Off** then **On** again in the Admin UI so voice gets enabled for the server.

---

## 4. Turn on conversation mode (for you, in that server)

Conversation mode is **per user per server**: “my voice in this server goes to Grok”.

**Option A – Discord**

- In that server, run: **`/chat on`**
- To check: **`/chat status`**
- To turn off: **`/chat off`** or **`/chat toggle`**

**Option B – Admin UI**

- Open **Dashboard → Admin**.
- In **Run commands**, select the **Server** (guild) where you’ll use voice.
- In **Grok conversation mode (voice)**:
  - Click **Turn on**.
- Same Discord account as the one you use in the voice channel must be logged in to the dashboard.

---

## 5. Join voice and speak

1. **Join a voice channel** in that server **where the Pranjeet (voice) bot is already in the channel**.
2. Wait for the “Started voice listening” style log if you have logs (Pranjeet).
3. **Speak**. Your audio is streamed to the Grok Voice Agent; when Grok replies, you hear it in the same channel.

If nothing happens:

- Ensure **Pranjeet** is in the channel (not only the orchestrator/other bots).
- Ensure **REDIS_URL** is set for Pranjeet and that the TTS queue has started (so Redis is read for `voice:interaction:enabled`).
- Ensure **GROK_API_KEY** (or **XAI_API_KEY**) is set for Pranjeet.
- Try **Turn off** then **Turn on** again in the Admin UI for that server (to re-enable voice for the guild).
- Check Pranjeet logs:
  - **Voice Agent path (realtime):** `Voice Agent client created for guildId:userId` → you’re on the realtime path; no STT/TTS keys needed for that path.
  - **Text path (STT → Grok → TTS):** `getGrokReply called` and `Generating TTS for:` → you’re on the text path; set **OPENAI_API_KEY** (or STT_API_KEY + TTS_API_KEY) to fix “OpenAI API key required” and mock STT/TTS.
  - **Voice Agent skipped:** `Voice Agent skipped: Grok not configured` → set GROK_API_KEY. `Voice Agent: no connection on session` → you’re not in a VC with the bot or the connection wasn’t ready.

---

## Quick checklist

| Step | What                                               | Where                                                                                              |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1    | Set **REDIS_URL** (Raincloud + Pranjeet)           | Env                                                                                                |
| 2    | Set **GROK_API_KEY** or **XAI_API_KEY** (Pranjeet) | Env                                                                                                |
| 3    | Deploy slash commands                              | Discord or Admin → Redeploy commands                                                               |
| 4    | Enable voice for the server                        | `/voice-control enable` **or** Turn on Grok conversation in Admin (turns on voice for that server) |
| 5    | Turn on conversation mode for you                  | `/chat on` **or** Admin → select server → Grok conversation → **Turn on**                          |
| 6    | Join VC with Pranjeet and speak                    | Discord                                                                                            |

---

## Commands reference

| Command                    | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| **/voice-control enable**  | Enable voice commands / voice listening for this server (Manage Server). |
| **/voice-control disable** | Disable voice for this server.                                           |
| **/voice-control status**  | Show whether voice is enabled.                                           |
| **/chat on**               | Turn on Grok conversation mode for you in this server.                   |
| **/chat off**              | Turn off Grok conversation mode.                                         |
| **/chat toggle**           | Toggle conversation mode.                                                |
| **/chat status**           | Show whether conversation mode is on.                                    |

Admin UI (Dashboard → Admin):

- **Redeploy commands** – register slash commands (e.g. so `/chat` and `/voice-control` appear).
- **Run commands** – select server, then under **Grok conversation mode (voice)** use **Turn on** / **Turn off** (this also enables voice for the server when you turn on).
