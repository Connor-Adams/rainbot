# Fixing YouTube 403 Forbidden Errors

If you're experiencing 403 errors when trying to play YouTube videos, this is due to YouTube's authentication requirements. The bot needs cookies to authenticate with YouTube.

## Symptoms

- Tracks fail to play with "Stream fetch failed: 403" errors
- Error messages like: `All streaming methods failed for [track name]: Stream fetch failed: 403`
- Tracks are skipped instead of playing

## Root Cause

YouTube now requires authentication for many videos. Without proper cookies, yt-dlp cannot fetch stream URLs, resulting in 403 Forbidden errors.

## Solution: Configure YouTube Cookies

### Step 1: Export Cookies from Your Browser

You need to export cookies from a browser where you're logged into YouTube. Use a browser extension:

**For Chrome/Chromium:**
- [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

**For Firefox:**
- [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

**For Edge:**
- [Get cookies.txt LOCALLY](https://microsoftedge.microsoft.com/addons/detail/get-cookiestxt-locally/cdakjobnimidonjdcpfhpdniacdlkbpd)

### Step 2: Generate Cookies File

1. Log into YouTube in your browser
2. Click the extension icon and export cookies for `youtube.com`
3. Save the file as `cookies.txt` (Netscape format)
4. Store it securely on your server

### Step 3: Configure Environment Variable

Add the following to your `.env` file:

```bash
# Path to cookies file (absolute or relative path)
YTDLP_COOKIES=/path/to/cookies.txt
```

**Examples:**
```bash
# Absolute path
YTDLP_COOKIES=/home/bot/rainbot/cookies.txt

# Relative path (from bot root directory)
YTDLP_COOKIES=./cookies.txt
```

### Step 4: Restart the Bot

After setting the environment variable, restart the bot:

```bash
npm run start
```

You should see this log message when the bot starts:
```
[AUDIO_RESOURCE] Using cookies file: /path/to/cookies.txt
```

## Verification

Test by playing a YouTube video. The bot should:
1. Successfully fetch the stream URL
2. Play the track without 403 errors
3. Log "Successfully recovered from 403" if temporary issues occur

## Troubleshooting

### Cookies Not Working

- **Check file path**: Ensure the path in `YTDLP_COOKIES` is correct
- **Check file format**: Must be Netscape cookies format (`.txt`)
- **Check permissions**: The bot must have read access to the cookies file
- **Check if logged in**: Make sure you were logged into YouTube when exporting cookies
- **Re-export cookies**: Cookies expire, export fresh ones every few weeks

### Still Getting 403 Errors

1. **Update yt-dlp**: Ensure you're using the latest version
   ```bash
   pip install -U yt-dlp
   # or
   npm update youtube-dl-exec
   ```

2. **Check logs**: Look for cookie-related error messages
   ```bash
   grep -i "cookie\|403" logs/
   ```

3. **Test yt-dlp directly**: Verify cookies work with yt-dlp CLI
   ```bash
   yt-dlp --cookies /path/to/cookies.txt --get-url "https://www.youtube.com/watch?v=VIDEO_ID"
   ```

4. **Check YouTube restrictions**: Some videos may be region-locked or unavailable

## Security Notes

⚠️ **Important**: Cookies contain authentication tokens. Keep them secure:

- Don't commit `cookies.txt` to version control (add to `.gitignore`)
- Set appropriate file permissions (`chmod 600 cookies.txt`)
- Don't share cookies publicly
- Regenerate cookies regularly (every 2-4 weeks)
- Use a dedicated YouTube account for the bot (optional but recommended)

## Railway/Cloud Deployment

For Railway or other cloud platforms:

1. Upload cookies file to secure storage or use environment variable
2. Set `YTDLP_COOKIES` to the file path
3. Ensure the file persists across deployments

**Railway example:**
```bash
# In Railway dashboard, add environment variable:
YTDLP_COOKIES=/app/cookies.txt
```

Then mount or upload the cookies file to `/app/cookies.txt`.

## Alternative: Use play-dl Fallback

If you can't use cookies, the bot will automatically fall back to `play-dl` library, which may work for some videos but has limitations:

- Slower performance
- May not work for all videos
- No cache optimization

To rely on play-dl fallback, simply don't set `YTDLP_COOKIES`. The bot will try:
1. yt-dlp with fetch (fails if no cookies) → 403
2. yt-dlp piping (fails if no cookies) → 403
3. play-dl (may work for some videos)

## More Information

- [yt-dlp authentication documentation](https://github.com/yt-dlp/yt-dlp#authentication-with-netscape-http-cookie-file)
- [YouTube API changes affecting bots](https://github.com/yt-dlp/yt-dlp/issues/10085)
