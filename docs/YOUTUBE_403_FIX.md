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

## 2. Optional: YouTube cookies (reduces 403 / "Sign in to confirm" errors)

Cookies from a logged-in browser fix both 403 and "Sign in to confirm you're not a bot" errors.

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

## 3. Optional: Override player client

If a specific client works better for your region/YouTube version, override extractor args on the **Rainbot** worker:

```env
# Try mweb or other clients (comma-separated, tried in order)
YTDLP_EXTRACTOR_ARGS=youtube:player_client=mweb,android,tv_embedded
```

Default is `tv_embedded,android,ios,web`.

## 4. Ensure yt-dlp is on PATH

Rainbot uses `yt-dlp` (or `YTDLP_PATH` if set). On Railway, install yt-dlp in your build (e.g. nixpacks, Dockerfile, or apt). If piping fails with "command not found", set:

```env
YTDLP_PATH=/full/path/to/yt-dlp
```

## Summary

- **Pipe path** = no direct fetch, usually avoids 403; may be slightly slower to start.
- **Update yt-dlp** and optionally set **YTDLP_COOKIES** or **YTDLP_EXTRACTOR_ARGS** if you still hit 403 or playback failures.
