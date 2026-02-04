---
name: ""
overview: ""
todos: []
isProject: false
---

# Displaying the Current YouTube Video in the Discord Call

## Summary

- **Video stream in the voice pipe (bot as camera/screen share)**: Not possible with a **bot token**. Discord blocks video from bots. Every reverse‑engineered solution (Discord-RE, @xijulian/discord-video-stream, Puppeteer+loopback) requires a **user/selfbot token** and violates ToS.
- **Video in the call via Discord Activity**: **Possible and supported.** Build a custom Activity (Embedded App SDK) that shows the current YouTube video in an iframe in the voice channel. The bot keeps playing audio; the Activity displays the video. You can launch the Activity from a slash command via a voice channel invite.

---

## 1. Voice-pipe video (bot streams video) — not possible for bots

**Discord does not allow bots to send video in voice connections.**

- **Official API**: [@discordjs/voice](https://discord.js.org/docs/packages/voice/main) (used in this repo) only supports **audio** (VoiceConnection + AudioPlayer). No video API for bots.
- **Reverse‑engineered libraries**:  
  - [Discord-RE/Discord-video-stream](https://github.com/Discord-RE/Discord-video-stream) and [@xijulian/discord-video-stream](https://www.npmjs.com/package/@xijulian/discord-video-stream) implement RTP/UDP video. Their READMEs state: **"Does this library work with bot tokens? No. Discord blocks video from bots. You must use a user token."** They depend on `discord.js-selfbot-v13` (user account).  
  - Using a user token as a selfbot violates [Discord ToS](https://discord.com/terms) and risks account bans.
- **Puppeteer + loopback** ([aixxe.net article](https://aixxe.net/2021/04/discord-video-bot)): A **user account** logs into Discord in a browser; FFmpeg pipes YouTube into virtual camera/mic (v4l2loopback, snd-aloop). The “video in call” is the user’s “camera,” not a bot. Same ToS/selfbot risk.

So you **cannot** have the bot itself stream the current YouTube video as camera/screen-share in the call. The only way to get real video in the voice pipe is with a user token (selfbot), which is against ToS.

---

## 2. Legitimate way: Discord Activity (video in the call UI)

Discord’s **Embedded App SDK** supports “Listen and Watch Parties” — shared video experiences **inside the voice channel** in an iframe (the Activity panel), not as a camera stream.

### How it works

- An **Activity** is a web app that runs in an iframe when users open it in a voice (or text) channel.
- Your **bot** keeps playing **audio** in the voice channel as it does today (no change to voice pipeline).
- You build a **custom Activity** that:
  1. Uses `getSelectedVoiceChannel()` (Embedded App SDK) to get the current guild/channel.
  2. Calls your **raincloud API** (e.g. existing queue/now-playing endpoint by guild ID) to get the current track and its YouTube URL.
  3. Renders that **YouTube video** in the Activity (e.g. iframe embed or similar).
- Users see the **current YouTube video** in the Activity panel **in the same call** where the bot is playing audio. So “the current YouTube video that’s playing” is displayed as video in the Discord call — in the Activity area, not as a camera feed.

### Launching the Activity from the bot

- A **slash command** (e.g. `/watch` or from `/np`) can create a **voice channel invite** that targets your Activity:
  - `voiceChannel.createInvite({ targetType: InviteTargetType.EmbeddedApplication, targetApplication: yourActivity })`
- The response can include that invite (or a button/link that uses it). Users click “Start” and the Activity opens in the voice channel, showing the current track’s video.

### What you’d build


| Piece                                  | Purpose                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Custom Activity** (Embedded App SDK) | Web app that gets voice channel context, fetches current track from your API, and displays the YouTube video. Optionally sync playback position from your API.    |
| **Raincloud API**                      | Already exposes queue/now-playing per guild; Activity just needs a stable endpoint (e.g. by guild ID) that returns current track + URL (and optionally position). |
| **Slash command or `/np**`             | Create invite with `targetApplication` set to your Activity and return it so users can open “Watch current video” in the VC.                                      |


### References

- [Activities overview](https://discord.com/developers/docs/activities/overview) — launching, Embedded App SDK.  
- [Building an Activity](https://discord.com/developers/docs/activities/building-an-activity) — lifecycle, SDK usage.  
- [Embedded App SDK](https://discord.com/developers/docs/developer-tools/embedded-app-sdk) — e.g. `getSelectedVoiceChannel()`.  
- [Stack Overflow: Launch Activity from slash command](https://stackoverflow.com/questions/79525967) — `createInvite` with `EmbeddedApplication` / `targetApplication`.  
- Discord’s built-in **Watch Together** is the same idea (shared YouTube in an Activity); your Activity would be driven by **your bot’s** current queue.

---

## 3. Other options (no additional video in call)

- **“Watch on YouTube” link in Discord**: Add a link button to the now‑playing reply (e.g. in [utils/playerEmbed.ts](utils/playerEmbed.ts)) when the track has a YouTube URL so users can open the video in the browser. Improves discoverability of the current video; no video inside Discord.
- **Dashboard**: Your [NowPlayingCard](ui/src/components/NowPlayingCard.tsx) already can show a “Watch on YouTube” (or source) link; no change needed for that.

---

## 4. Recommendation

- **If the goal is “video in the call” (inside Discord, in the same VC)**  
Use the **Discord Activity** approach: custom Activity that shows the current YouTube video in the iframe, launched from the bot via voice channel invite; bot continues to play audio only.
- **If the goal is “easy link to the current video”**  
Add a “Watch on YouTube” (or similar) link/button to the Discord now‑playing message when the track has a YouTube URL.
- **Do not** use a user/selfbot token or Puppeteer+user-account loopback to fake bot video; it violates ToS and risks bans.

