---
name: 'Discord Activity for now-playing video'
overview: 'Fleshed-out plan to build a Discord Activity that displays the current YouTube video in the voice-call UI, backed by a read-only API and a /watch slash command that creates an Activity invite.'
todos:
  - id: portal-setup
    content: 'Enable Activities and configure URL mapping in Discord Developer Portal'
  - id: activity-api
    content: 'Add GET /api/activity/now-playing/:guildId (requireAuth, same Discord OAuth as UI)'
  - id: activity-app
    content: 'Create Activity app (Vite + Embedded App SDK, getSelectedVoiceChannel, YouTube embed)'
  - id: activity-host
    content: 'Host Activity frontend and set production URL mapping'
  - id: watch-command
    content: 'Add /watch slash command (voice invite with targetApplication)'
  - id: playback-sync
    content: 'Playback sync (default): positionMs/isPaused in API; video starts when audio starts, pauses when paused, seeks to position'
isProject: false
---

# Displaying the Current YouTube Video in the Discord Call

## Summary

- **Video stream in the voice pipe (bot as camera/screen share)**: Not possible with a **bot token**. Discord blocks video from bots. Every reverse-engineered solution (Discord-RE, @xijulian/discord-video-stream, Puppeteer+loopback) requires a **user/selfbot token** and violates ToS.
- **Video in the call via Discord Activity**: **Possible and supported.** Build a custom Activity (Embedded App SDK) that shows the current YouTube video in an iframe in the voice channel. The bot keeps playing audio; the Activity displays the video. You can launch the Activity from a slash command via a voice channel invite.

---

## 1. Voice-pipe video (bot streams video) — not possible for bots

**Discord does not allow bots to send video in voice connections.**

- **Official API**: [@discordjs/voice](https://discord.js.org/docs/packages/voice/main) (used in this repo) only supports **audio** (VoiceConnection + AudioPlayer). No video API for bots.
- **Reverse-engineered libraries**: [Discord-RE/Discord-video-stream](https://github.com/Discord-RE/Discord-video-stream) and [@xijulian/discord-video-stream](https://www.npmjs.com/package/@xijulian/discord-video-stream) implement RTP/UDP video. Their READMEs state: **"Does this library work with bot tokens? No. Discord blocks video from bots. You must use a user token."** They depend on `discord.js-selfbot-v13` (user account). Using a user token as a selfbot violates [Discord ToS](https://discord.com/terms) and risks account bans.
- **Puppeteer + loopback** ([aixxe.net article](https://aixxe.net/2021/04/discord-video-bot)): A **user account** logs into Discord in a browser; FFmpeg pipes YouTube into virtual camera/mic (v4l2loopback, snd-aloop). The "video in call" is the user's "camera," not a bot. Same ToS/selfbot risk.

So you **cannot** have the bot itself stream the current YouTube video as camera/screen-share in the call. The only way to get real video in the voice pipe is with a user token (selfbot), which is against ToS.

---

## 2. Discord Activity — fleshed-out plan

### 2.1 Architecture

- **Same Discord Application**: The Activity uses the **same** Discord app as the raincloud bot (same Client ID). Enable "Activities" for that app and add a URL mapping to the Activity frontend.
- **Flow**: User in VC runs `/watch` (or clicks a link from `/np`) → bot creates a voice channel invite with `targetApplication` = app ID → user clicks "Start" → Discord opens the Activity iframe → Activity calls `getSelectedVoiceChannel()` to get `guild_id` → Activity calls raincloud API `GET /api/activity/now-playing/:guildId` → renders current track's YouTube URL in an embed/iframe.
- **Auth**: Discord OAuth is already implemented in the UI. The Activity can use the **same auth pattern**: when the Activity loads, it uses the Embedded App SDK `authorize` command, your backend exchanges the code for an access token (same as the UI), and the Activity calls the API with that token. The now-playing endpoint can then use `requireAuth` (and optionally `requireGuildMember`) like other routes, so no separate unauthenticated or secret-only endpoint is needed.

### 2.2 Discord Developer Portal

- **App**: Use the existing raincloud application (same as the bot).
- **Installation**: Ensure "Guild Install" (and optionally "User Install") so the Activity can be opened in servers where the bot is present.
- **OAuth2**: Add a redirect URI (e.g. `https://127.0.0.1` for dev; production URL for prod) for the Embedded App SDK authorize flow if you later want Activity-side Discord auth.
- **Activities**:
  - Open **Activities → Settings** and **Enable Activities**.
  - **Activities → URL Mappings**: Map `/` to the **public** URL that serves the Activity frontend (e.g. dev: `https://xxx.trycloudflare.com` from `cloudflared tunnel --url http://localhost:5xxx`; prod: `https://activity.yourdomain.com` or a path on your main domain).
- **Entry Point**: Enabling Activities creates a default "Launch" Entry Point command; users can open the Activity from the App Launcher. The `/watch` command will create an invite that also opens this Activity.

### 2.3 Backend: Activity now-playing API

- **Endpoint**: `GET /api/activity/now-playing/:guildId`
- **Purpose**: Return current track and playback state so the Activity can display the YouTube video and keep it in sync with the bot's audio (video starts when audio starts, pauses when paused, seeks to position).
- **Payload**: `{ nowPlaying: MediaItem | null, positionMs?: number, isPaused?: boolean }`. `positionMs` and `isPaused` are required for sync. `MediaItem` is in [packages/protocol/src/types/media.ts](packages/protocol/src/types/media.ts) (`title`, `url`, `duration`, `thumbnail`, etc.).
- **Auth**: Use the **existing Discord OAuth** already implemented in the UI. The Activity runs the same flow (Embedded App SDK `authorize` → backend exchanges code for access token → Activity stores token and sends it on API requests). The endpoint can use `requireAuth` (and `requireGuildMember` if desired) like other API routes; the Activity passes the user's token in the `Authorization` header (or cookie, if your UI uses cookie-based session).
- **Implementation**: In [apps/raincloud/server/routes/api.ts](apps/raincloud/server/routes/api.ts), add a route (e.g. `GET /api/activity/now-playing/:guildId`) with `requireAuth` and optionally `requireGuildMember`, that calls `getPlaybackService().getQueue(guildId)` (or `getQueueInfo`), then returns `{ nowPlaying: queue.nowPlaying, positionMs: queue.positionMs, isPaused: queue.isPaused }`.
- **CORS**: Allow the Activity origin (Discord proxy origin or your Activity URL). Discord's docs note that Activities go through a proxy; see [Constructing a Full URL](https://discord.com/developers/docs/activities/development-guides/networking#construct-a-full-url) and ensure your API allows requests from the Activity (e.g. allow the Discord proxy origin or your mapped Activity domain).

### 2.4 Activity app (frontend)

- **Stack**: Small web app that runs inside the Discord Activity iframe. Use **Vite + React** (or vanilla JS) and **@discord/embedded-app-sdk**.
- **Placement**: The Activity UI will live in the monorepo (e.g. `apps/raincloud-activity/`), so API base URL and secrets stay in one place.
- **Steps**:
  1. **SDK init**: Instantiate `DiscordSDK` with the app's client ID, call `await discordSdk.ready()`.
  2. **Voice channel**: Call `discordSdk.commands.getSelectedVoiceChannel()` (or `getChannel` with `discordSdk.channelId`) to get the current voice channel; from that, get `guild_id` (and channel name for UI).
  3. **Fetch now-playing**: Call the API with the same auth as the UI (Discord OAuth). After the Activity completes the Embedded App SDK `authorize` flow and your backend returns an access token, use that token for requests: `fetch(API_BASE + '/api/activity/now-playing/' + guildId, { headers: { Authorization: 'Bearer ' + accessToken } })`. API_BASE must be the full URL to raincloud (Discord proxy rules: use full URLs for external requests).
  4. **Render**: If `nowPlaying?.url` is a YouTube URL, show it in an iframe (e.g. `https://www.youtube.com/embed/VIDEO_ID?start=...`). Show title, thumbnail, and "Nothing playing" when null.
  5. **Playback sync (default)**: Keep the Activity video in sync with the bot's audio. When audio starts, the video should also start; when audio is paused, pause the video; when position changes (e.g. seek or new track), seek the YouTube player to `positionMs / 1000`. Use the API's `positionMs` and `isPaused`, and the YouTube iframe API (`play`, `pause`, `seekTo`). Poll the now-playing endpoint every few seconds or use SSE from an existing endpoint if you add Activity access.
  6. **Auth**: Use the **same Discord OAuth** already implemented for the UI. In the Activity, run the Embedded App SDK flow: `authorize` → send code to your backend (same endpoint the UI uses) → receive access token → call API with that token. Reuse the same backend token exchange and session/token handling as the dashboard so the Activity can call `requireAuth`-protected routes.

### 2.5 Hosting and URL mapping

- **Dev**: Run Activity frontend (e.g. `npm run dev` in the Activity app). Expose with `cloudflared tunnel --url http://localhost:5xxx`. Put the tunnel URL in **Activities → URL Mappings** (`/` → tunnel host).
- **Prod**: Build the Activity (e.g. `npm run build`), serve the built static files from your server or CDN (e.g. same domain as raincloud at `https://yourdomain.com/activity/` or a subdomain). Set **URL Mappings** to that public URL. Ensure HTTPS and correct CORS for the API.

### 2.6 Bot: /watch command

- **Command**: New slash command `watch` (e.g. in [apps/raincloud/commands/voice/](apps/raincloud/commands/voice/)): "Open the current track's video in an Activity."
- **Behavior**:
  1. Require the user to be in a voice channel (same as `/join`/`/np`).
  2. Get the voice channel and ensure the bot is in that guild (optional: check bot is in VC).
  3. Create an invite with `channel.createInvite({ targetType: InviteTargetType.EmbeddedApplication, targetApplication: client.application?.id })`. Use Discord.js types for `InviteTargetType.EmbeddedApplication` (e.g. `ApplicationFlags.Embedded` or the enum value for embedded application invites).
  4. Reply with the invite URL (or a button that opens it) so the user can click "Start" and open the Activity in that voice channel.
- **Alternative**: Add a "Watch in Activity" button to the `/np` reply that does the same (create invite + link), so users can open the Activity from the now-playing card.

### 2.7 Playback sync (default)

- **API**: Always include `positionMs` and `isPaused` in `GET /api/activity/now-playing/:guildId` from existing queue/playback state.
- **Activity**: Sync the video to the bot's audio. When the bot's audio starts, the Activity video should start (call YouTube iframe API `play()`). When the bot is paused, pause the video (`pause()`). When position changes (seek or new track), seek the player to `positionMs / 1000` (`seekTo(positionMs / 1000)`). Poll the now-playing endpoint or use SSE so the Activity stays in sync. The result: if audio starts, the video starts; if audio pauses, the video pauses; position stays aligned.

### 2.8 File and directory sketch

- **New**: `apps/raincloud-activity/` (in the monorepo) — Vite + React (or vanilla), `@discord/embedded-app-sdk`, single view: voice channel → fetch now-playing → YouTube embed.
- **New route**: [apps/raincloud/server/routes/api.ts](apps/raincloud/server/routes/api.ts) — `GET /api/activity/now-playing/:guildId`.
- **New command**: [apps/raincloud/commands/voice/watch.js](apps/raincloud/commands/voice/watch.js) (or `.ts` if you use TS for commands) — create voice invite with `targetApplication`, reply with link/button.
- **Config**: Env var for API base URL (Activity). Auth uses the existing Discord OAuth backend (same as UI); no separate Activity secret needed.

### 2.9 References

- [Activities overview](https://discord.com/developers/docs/activities/overview)
- [Building an Activity](https://discord.com/developers/docs/activities/building-an-activity) — URL mapping, OAuth, getChannel/getSelectedVoiceChannel
- [Embedded App SDK](https://discord.com/developers/docs/developer-tools/embedded-app-sdk)
- [Launch Activity from slash command](https://stackoverflow.com/questions/79525967) — `createInvite` with `EmbeddedApplication` / `targetApplication`

---

## 3. Other options (no additional video in call)

- **"Watch on YouTube" link in Discord**: Add a link button to the now-playing reply (e.g. in [utils/playerEmbed.ts](utils/playerEmbed.ts)) when the track has a YouTube URL so users can open the video in the browser. Improves discoverability of the current video; no video inside Discord.
- **Dashboard**: Your [NowPlayingCard](ui/src/components/NowPlayingCard.tsx) already can show a "Watch on YouTube" (or source) link; no change needed for that.

---

## 4. Recommendation

- Implement the **Discord Activity** path as above: portal setup → activity API → Activity app → hosting → `/watch` command → **playback sync by default** (video starts when audio starts, pauses when paused, seeks to position).
- Use the **existing Discord OAuth** (already in the UI) for the Activity so the now-playing endpoint can stay auth-protected; reuse the same token exchange and API auth as the dashboard.
- **Do not** use a user/selfbot token or Puppeteer+user-account loopback to fake bot video; it violates ToS and risks bans.
