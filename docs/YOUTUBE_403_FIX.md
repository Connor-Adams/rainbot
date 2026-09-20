# YouTube 403 / Playback Issues

YouTube often returns **403 Forbidden** when stream URLs are fetched directly. The Rainbot worker handles this by:

1. **Preferring yt-dlp piping** – streams via subprocess stdout (no direct fetch to YouTube), which avoids 403.
2. **Falling back to async fetch** – if piping fails, tries get_url + fetch (may get 403).
3. **Falling back to play-dl** – last resort.

If you still see **Stream fetch failed: 403** or playback fails:

## 1. Keep yt-dlp updated

YouTube changes often; yt-dlp releases fixes frequently. On Railway or Docker, use a recent image or install the latest:

```bash
# Check version
yt-dlp --version

# Update (pip)
pip install -U yt-dlp

# Or use system package / nixpkgs that provides a recent build
```

## 2. Outbound proxy (the actual fix for bot checks)

YouTube refuses requests from datacenter IP ranges, which is what Railway runs
on. This was confirmed directly in the rainbot container: with a PO token
provider reachable and no cookies, one video was refused with
`Sign in to confirm you're not a bot` across **six** player clients — `tv`,
`default,tv`, `android_vr`, `web_embedded`, `tv_simply`, `mweb`. The verbose log
shows yt-dlp's defaults (`visionos`, `web`) both returning
`playability status: LOGIN_REQUIRED`, and the PO token provider is never even
invoked, because a GVS token is only fetched once formats resolve and the
_player_ request is refused before that.

The identical command from a residential IP returns `251 opus` immediately.

So: nothing client-side fixes this. Either the request comes from an acceptable
IP, or it carries a signed-in session (cookies, which rot). Routing yt-dlp
through a proxy with a residential or mobile IP is the durable answer.

Set it in the dashboard under **Admin → YouTube proxy**. Accepted schemes are
`http`, `https`, `socks4`, `socks4a`, `socks5`, `socks5h`. Rainbot re-reads it
every five minutes, so a change applies without a restart.

The stored value normally contains credentials, so it is only ever returned to
the dashboard with the password redacted. Workers read the real value from
`/internal/proxy/youtube`, which is gated by `WORKER_SECRET`.

`YTDLP_PROXY_OVERRIDE` on the rainbot service takes precedence over the
dashboard, for pinning a proxy without touching the UI.

**Known limitation:** only the yt-dlp path is proxied. The direct-fetch fallback
and the play-dl fallback still go out over the datacenter IP — play-dl has no
proxy support at all. Since yt-dlp piping is the primary path, that is usually
invisible, but a failure that falls through those tiers will still hit the bot
check.

## 3. PO token providers: tried, measured, removed

A `bgutil-ytdlp-pot-provider` server was run here for a while. It is **not**
installed any more. The reasoning is kept so it is not rediscovered the hard way.

PO tokens gate **GVS** — the media download — for `web`-family clients. They do
nothing about an IP-level refusal, which happens earlier, at the _player_
request. With the provider running and reachable, a video was still refused
across six player clients, and the verbose log showed the provider was never even
invoked, because extraction never reached format resolution.

Once the proxy was in place the provider became measurably unnecessary: a full
3.8MB audio download completed with the provider deliberately pointed at a dead
port, because yt-dlp selects the `visionos` client, which carries no PO token
requirement at all.

Leaving the plugin installed without a reachable server also makes yt-dlp warn on
every single call:

```
WARNING: [youtube] [pot:bgutil:http] Error reaching GET http://127.0.0.1:4416/ping
```

Unsetting `BGUTIL_POT_BASE_URL` does not silence that — the plugin falls back to
the localhost default and warns anyway. A warning printed on every call is a
warning nobody reads, and this repo has already lost three debugging rounds to a
real warning hiding in noise.

If YouTube ever forces a `web`-family client, reinstate it: add
`bgutil-ytdlp-pot-provider` to the Dockerfile's pip install, run the
`brainicism/bgutil-ytdlp-pot-provider` image (port 4416, tag matching the plugin
version), and pass
`--extractor-args youtubepot-bgutilhttp:base_url=http://<service>:4416`. Note
that a pip install provides only the `http` provider — its script providers
report `unavailable`, because they look for a checked-out server build that pip
does not ship.

## 4. YouTube cookies (fallback, and a treadmill)

Cookies from a logged-in browser also clear 403 and bot-check errors, because a
signed-in session outranks the IP's reputation. But they expire and have to be
re-exported, which is the treadmill the proxy exists to end. Prefer the proxy in
section 2; reach for cookies only when there is no usable proxy.

### Option A: Upload via Dashboard (recommended)

1. In the dashboard, go to **Admin** tab.
2. Under **YouTube cookies**, export cookies from your browser (extension like "Get cookies.txt LOCALLY").
3. Upload the `.txt` file.
4. Rainbot fetches cookies from raincloud automatically; restart rainbot to pick up new cookies immediately.

### Option B: Environment variable

1. Export cookies (browser extension like "Get cookies.txt" or similar).
2. Save as a file (e.g. `youtube_cookies.txt`).
3. Set env on the **Rainbot** worker:

   ```env
   YTDLP_COOKIES=/path/to/youtube_cookies.txt
   ```

On Railway, you can use a secret file or mount the cookies file and set `YTDLP_COOKIES` to that path.

## 5. Optional: Override player client

There is **no default override** — yt-dlp picks its own client list, which tracks
YouTube's changes. Only pin clients to work around a regression, and remove the
pin once yt-dlp catches up:

```env
# Comma-separated, tried in order
YTDLP_EXTRACTOR_ARGS=youtube:player_client=mweb,tv
```

A pinned list rots. `android`/`ios` are PO-token gated and `tv_embedded` is
age-gate-only; the old `tv_embedded,android,ios,web` default eventually returned
no audio-only formats at all, and playback failed with
`ERROR: [youtube] <id>: Requested format is not available`.

## 6. Ensure yt-dlp is on PATH

Rainbot uses `yt-dlp` (or `YTDLP_PATH` if set). On Railway, install yt-dlp in your build (e.g. nixpacks, Dockerfile, or apt). If piping fails with "command not found", set:

```env
YTDLP_PATH=/full/path/to/yt-dlp
```

## Summary

- **Pipe path** = no direct fetch, usually avoids 403; may be slightly slower to start.
- **Set a proxy** (Admin -> YouTube proxy). A bot check from a datacenter IP is an IP problem; no client, cookie or PO token setting solves it.
- A **PO token provider** was tried and removed — measured as unnecessary once the proxy was in place, and noisy when left installed.
- **YTDLP_COOKIES** and **YTDLP_EXTRACTOR_ARGS** remain available if you still hit 403 or playback failures.
