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

## 2. PO token provider (preferred over cookies)

YouTube demands a proof-of-origin token from IPs it treats as suspicious, which
includes essentially all datacenter ranges — so Railway trips the bot check even
when nothing is wrong with the bot. Cookies paper over that, but they rot:
YouTube rotates `__Secure-1PSIDTS`, so a jar exported from a browser you keep
using is invalidated quickly. A PO token provider addresses the cause instead,
with no account and no cookies.

The image already installs the `bgutil-ytdlp-pot-provider` plugin. The plugin
alone is **not** enough: a pip install gives you only its `http` provider,
because the script providers look for a checked-out server build under
`~/bgutil-ytdlp-pot-provider` that pip does not ship. `yt-dlp -v` shows exactly
that:

```
PO Token Providers: bgutil:http-2.0.0 (external),
                    bgutil:script-node-2.0.0 (external, unavailable),
                    bgutil:script-deno-2.0.0 (external, unavailable)
```

So the provider server has to run somewhere, and rainbot has to be pointed at it:

1. Add a Railway service from the Docker image
   `brainicism/bgutil-ytdlp-pot-provider`. Match its tag to the plugin version in
   the image (`pip show bgutil-ytdlp-pot-provider`) — plugin and server are
   expected to be on the same version.
2. It listens on port **4416**. Keep it on the private network; it needs no
   public domain.
3. On the **Rainbot** service:

   ```env
   BGUTIL_POT_BASE_URL=http://<provider-service>.railway.internal:4416
   ```

Leaving `BGUTIL_POT_BASE_URL` unset is safe — the plugin tries
`http://127.0.0.1:4416`, cannot reach it, and yt-dlp warns and carries on. That
same warning is how you spot a wrong value:

```
WARNING: [youtube] [pot:bgutil:http] Error reaching GET http://127.0.0.1:4416/ping
```

`TOKEN_TTL` (hours, default 6) on the provider service controls its token cache.

## 3. YouTube cookies (fallback, and a treadmill)

Cookies from a logged-in browser also clear 403 and bot-check errors, but they
expire and have to be re-exported. Prefer the PO token provider above.

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

## 4. Optional: Override player client

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

## 5. Ensure yt-dlp is on PATH

Rainbot uses `yt-dlp` (or `YTDLP_PATH` if set). On Railway, install yt-dlp in your build (e.g. nixpacks, Dockerfile, or apt). If piping fails with "command not found", set:

```env
YTDLP_PATH=/full/path/to/yt-dlp
```

## Summary

- **Pipe path** = no direct fetch, usually avoids 403; may be slightly slower to start.
- **Update yt-dlp** and run a **PO token provider** (`BGUTIL_POT_BASE_URL`). That, not cookies, is the durable answer to a bot check from a datacenter IP.
- **YTDLP_COOKIES** and **YTDLP_EXTRACTOR_ARGS** remain available if you still hit 403 or playback failures.
