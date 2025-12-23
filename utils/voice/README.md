# Voice Manager Module Architecture

The voice manager has been refactored from a single 72KB monolithic file into focused, maintainable modules.

## Module Structure

```
utils/voice/
├── audioResource.js      # Audio streaming and resource creation
├── constants.js          # Shared constants
├── queueManager.js       # Thread-safe queue operations
├── soundboardManager.js  # Soundboard overlay functionality
├── snapshotManager.js    # Queue persistence across restarts
├── trackFetcher.js       # URL parsing and metadata fetching
└── README.md            # This file
```

## Module Responsibilities

### audioResource.js
**Purpose:** Handle all audio streaming and resource creation

**Key Functions:**
- `getStreamUrl(url)` - Cache and fetch YouTube stream URLs
- `createTrackResourceAsync(track)` - Fast streaming using fetch API
- `createTrackResource(track)` - Fallback yt-dlp piping
- `createTrackResourceForAny(track)` - Universal track resource creator
- `createResourceWithSeek(track, seconds)` - Create resource at specific position
- `createVolumeResource(input, options)` - Helper for inline volume control

**Features:**
- LRU cache for stream URLs (2hr expiration, 500 max entries)
- Multiple fallback strategies for reliability
- Fetch API streaming for lower latency
- FFmpeg seeking for local files

---

### queueManager.js
**Purpose:** Thread-safe queue operations with mutex locking

**Key Functions:**
- `withQueueLock(guildId, fn)` - Execute function with exclusive lock
- `addToQueue(state, tracks)` - Add tracks to queue
- `clearQueue(state)` - Clear all tracks
- `removeTrack(state, index)` - Remove specific track
- `getNextTrack(state)` - Pop next track (FIFO)
- `skipTracks(state, count)` - Skip multiple tracks
- `getQueueSnapshot(state, limit)` - Get safe queue copy

**Why Mutex?**
Prevents race conditions when:
- Multiple API requests modify queue simultaneously
- Discord commands and web dashboard interact concurrently
- Ensures atomic operations on shared queue state

---

### soundboardManager.js
**Purpose:** Instant soundboard playback with music overlay

**Key Functions:**
- `playSoundboardOverlay(state, guildId, sound, ...)` - Mix soundboard over music
- `playSoundboardDirect(state, sound, ...)` - Direct playback (no music)
- `trackSoundboardUsage(sound, userId, ...)` - Statistics tracking

**Features:**
- FFmpeg audio mixing (soundboard + music at full volume)
- Automatic seeking to maintain music position
- Works even when music is paused
- Fallback to direct playback if overlay fails
- Spammable (kills previous overlay instantly)

**Important:** Soundboards are **never queued** - always play immediately!

---

### snapshotManager.js
**Purpose:** Persist queue state across bot restarts

**Key Functions:**
- `saveQueueSnapshot(guildId, state)` - Save to database
- `saveAllQueueSnapshots(voiceStates)` - Batch save on shutdown
- `restoreQueueSnapshot(guildId, client, ...)` - Restore single guild
- `restoreAllQueueSnapshots(client, ...)` - Restore all on startup

**Saved State:**
- Queue tracks and current track
- Playback position (accounting for pauses)
- Volume level
- Paused state
- Last user who played music

**Flow:**
```
1. Bot shutdown → Save all guild queues to DB
2. Bot startup → Restore queues from DB
3. Rejoin voice channels
4. Resume playback at exact position (even if paused)
5. Delete snapshots after successful restore
```

---

### trackFetcher.js
**Purpose:** Fetch metadata and handle various source types

**Key Functions:**
- `detectUrlType(url)` - Fast URL type detection
- `fetchYouTubeMetadata(url)` - Get video info
- `fetchYouTubePlaylist(url, callbacks)` - Stream playlist loading
- `processSpotifyTracks(tracks, callback)` - Find YouTube equivalents
- `searchYouTube(query)` - Search and return first result

**Supported Sources:**
- YouTube (videos, playlists)
- Spotify (tracks, playlists, albums) → converted to YouTube
- SoundCloud (tracks, playlists)
- Direct URLs (via play-dl)

**Optimization:**
- First track queued instantly for playlists
- Remaining tracks fetched in background
- No blocking HTTP requests for known URL types

---

### constants.js
**Purpose:** Shared configuration values

**Constants:**
- `CACHE_EXPIRATION_MS` - Stream URL cache lifetime (2 hours)
- `MAX_CACHE_SIZE` - Maximum cached URLs (500)
- `FETCH_TIMEOUT_MS` - Network request timeout (10 seconds)

---

## Integration Example

The main voiceManager.js orchestrates these modules:

```javascript
const { withQueueLock, addToQueue } = require('./voice/queueManager');
const { createTrackResourceForAny } = require('./voice/audioResource');
const { playSoundboardOverlay } = require('./voice/soundboardManager');
const { saveQueueSnapshot } = require('./voice/snapshotManager');
const { detectUrlType, searchYouTube } = require('./voice/trackFetcher');

// Add track with thread safety
await withQueueLock(guildId, async () => {
    addToQueue(state, tracks);
    if (!isPlaying) {
        const resource = await createTrackResourceForAny(tracks[0]);
        state.player.play(resource.resource);
    }
});
```

## Benefits of Modular Architecture

1. **Maintainability** - Each module has a single, clear responsibility
2. **Testability** - Functions can be unit tested in isolation
3. **Reusability** - Modules can be used independently
4. **Readability** - 72KB file split into ~300-500 line focused modules
5. **Thread Safety** - Centralized queue locking prevents race conditions
6. **Dependency Injection Ready** - Easy to mock modules for testing

## Migration Notes

The original `voiceManager.js` is now a thin orchestration layer that:
- Maintains the same public API (no breaking changes)
- Delegates operations to specialized modules
- Manages voice state map
- Handles Discord.js voice events

All existing commands and API endpoints continue to work without modification.
