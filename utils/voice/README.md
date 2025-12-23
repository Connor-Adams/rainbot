# Voice Module Architecture

This directory contains the refactored voice management system, split into focused, maintainable modules.

## Overview

The original `voiceManager.js` (72KB) has been split into specialized modules for better maintainability, testability, and code organization.

## Module Structure

```
utils/voice/
├── index.js                 # Main entry point, re-exports all modules
├── constants.js             # Shared constants
├── audioResource.js         # Audio streaming & resource creation
├── queueManager.js          # Thread-safe queue operations
├── playbackManager.js       # Playback control & state management
├── soundboardManager.js     # Soundboard overlay functionality
├── snapshotManager.js       # Queue persistence (save/restore)
├── trackMetadata.js         # YouTube/Spotify metadata fetching
└── README.md                # This file
```

## Module Responsibilities

### 🎵 audioResource.js
**Purpose:** Audio streaming and resource creation

**Key Functions:**
- `createVolumeResource()` - Create audio resource with volume support
- `getStreamUrl()` - Get cached stream URLs from yt-dlp
- `createTrackResourceAsync()` - Fast streaming via fetch (YouTube)
- `createTrackResource()` - Fallback yt-dlp piping
- `createTrackResourceForAny()` - Universal track resource creation
- `createResourceWithSeek()` - Create resource at specific position

**Features:**
- LRU cache for stream URLs (2 hour expiration)
- Fast fetch-based streaming for YouTube
- Automatic fallback to yt-dlp or play-dl
- Support for local files and remote streams

---

### 📋 queueManager.js
**Purpose:** Thread-safe queue operations

**Key Functions:**
- `withQueueLock()` - Execute function with exclusive queue lock
- `addToQueue()` - Add tracks to queue
- `clearQueue()` - Remove all tracks
- `removeTrack()` - Remove specific track by index
- `getNextTrack()` - Pop next track from queue
- `skipTracks()` - Skip multiple tracks
- `getQueueSnapshot()` - Get safe queue copy

**Features:**
- **Mutex locking** prevents race conditions
- Critical for concurrent API + Discord command access
- FIFO queue management
- Thread-safe operations for music playback only

---

### ▶️ playbackManager.js
**Purpose:** Playback control and state management

**Key Functions:**
- `playNext()` - Play next track in queue
- `playWithSeek()` - Resume playback at specific position
- `togglePause()` - Pause/resume with position tracking
- `setVolume()` - Adjust volume (1-100)
- `stopPlayback()` - Stop and clear queue
- `preBufferNext()` - Pre-buffer next track for instant skips

**Features:**
- Automatic error recovery and track skipping
- Playback position tracking (accounting for pauses)
- Statistics and listening history integration
- Pre-buffering for seamless playback

---

### 🔊 soundboardManager.js
**Purpose:** Soundboard overlay functionality

**Key Functions:**
- `playSoundboardOverlay()` - Mix soundboard over music with FFmpeg
- `playSoundboardDirect()` - Play soundboard without music
- `trackSoundboardUsage()` - Track statistics and history

**Features:**
- **Real-time audio mixing** with FFmpeg
- Soundboard plays at full volume over music
- Spammable (kills previous overlay instantly)
- Works even when music is paused
- Automatic fallback to direct playback

**Architecture:**
```
Music: ━━━━━━━━━━━━━━━━━━━━━━━━ (continuous)
Sound:         🔊 bruh        (overlay)
Output: ━━━━━━━[bruh]━━━━━━━━━━ (mixed)
```

---

### 💾 snapshotManager.js
**Purpose:** Queue persistence across bot restarts

**Key Functions:**
- `saveQueueSnapshot()` - Save guild queue to database
- `saveAllQueueSnapshots()` - Save all active queues
- `restoreQueueSnapshot()` - Restore guild queue on startup
- `restoreAllQueueSnapshots()` - Restore all saved queues

**Features:**
- Saves queue, current track, position, and volume
- Handles paused state correctly
- Automatic cleanup after successful restore
- Graceful handling of missing guilds/channels

**Use Cases:**
- Bot restarts/updates
- Server maintenance
- Crash recovery

---

### 🔍 trackMetadata.js
**Purpose:** Fetch track metadata from various sources

**Key Functions:**
- `fetchYouTubeMetadata()` - Get video info
- `fetchYouTubePlaylist()` - Get playlist entries
- `searchYouTube()` - Search for tracks
- `spotifyToYouTube()` - Convert Spotify track to YouTube
- `processSpotifyPlaylistTracks()` - Background playlist processing
- `detectUrlType()` - Fast URL type detection

**Features:**
- Fast URL type detection (no HTTP requests)
- Spotify → YouTube conversion
- Background playlist processing
- Rate limiting protection

---

### 🔧 constants.js
**Purpose:** Shared constants

```javascript
CACHE_EXPIRATION_MS: 2 hours
MAX_CACHE_SIZE: 500 URLs
FETCH_TIMEOUT_MS: 10 seconds
```

---

## Integration with Main voiceManager.js

The main `voiceManager.js` now acts as an **orchestrator** that:
1. Manages voice state Map
2. Handles Discord voice connections
3. Coordinates between modules
4. Exposes public API

This reduces the main file from **72KB to ~15-20KB**.

## Benefits of This Architecture

### ✅ Maintainability
- Each module has a single, clear responsibility
- Easier to locate and fix bugs
- Simpler to understand individual components

### ✅ Testability
- Modules can be tested independently
- Mock dependencies easily
- Unit tests can focus on specific functionality

### ✅ Dependency Injection Ready
- Modules accept dependencies as parameters
- Easy to swap implementations
- Better for testing and mocking

### ✅ Reusability
- Functions can be used across different contexts
- Common functionality extracted to shared modules
- Reduces code duplication

### ✅ Performance
- Module-level caching (stream URLs)
- Pre-buffering for instant skips
- Thread-safe operations prevent race conditions

## Usage Examples

### Basic Playback
```javascript
const { playNext } = require('./voice/playbackManager');
const { addToQueue } = require('./voice/queueManager');

// Add tracks to queue
addToQueue(state, [track1, track2, track3]);

// Start playback
await playNext(guildId, voiceStates);
```

### Thread-Safe Queue Operations
```javascript
const { withQueueLock, clearQueue } = require('./voice/queueManager');

// Ensure exclusive access
await withQueueLock(guildId, async () => {
    const cleared = clearQueue(state);
    console.log(`Cleared ${cleared} tracks`);
});
```

### Soundboard Overlay
```javascript
const { playSoundboardOverlay } = require('./voice/soundboardManager');

// Play sound over music
const result = await playSoundboardOverlay(
    state,
    guildId,
    'bruh.mp3',
    userId,
    'discord',
    username,
    discriminator
);

console.log(result.overlaid); // true if mixed, false if direct
```

### Snapshot Persistence
```javascript
const { saveQueueSnapshot, restoreQueueSnapshot } = require('./voice/snapshotManager');

// Save before shutdown
await saveQueueSnapshot(guildId, state);

// Restore on startup
await restoreQueueSnapshot(guildId, client, joinChannel, playWithSeek, playNext);
```

## Migration Notes

If updating existing code:

1. **Import from voice module:**
   ```javascript
   // Old
   const voiceManager = require('./voiceManager');
   
   // New
   const { playNext, addToQueue } = require('./voice');
   ```

2. **Pass voiceStates Map explicitly:**
   ```javascript
   // Many functions now require voiceStates as parameter
   await playNext(guildId, voiceStates);
   ```

3. **Use queue locks for concurrent access:**
   ```javascript
   // Always use withQueueLock for queue modifications
   await withQueueLock(guildId, async () => {
       addToQueue(state, tracks);
   });
   ```

## Future Improvements

- [ ] Add TypeScript type definitions
- [ ] Implement comprehensive unit tests
- [ ] Add integration tests for playback flow
- [ ] Create service classes for dependency injection
- [ ] Add event emitters for state changes
- [ ] Implement queue history/undo functionality
- [ ] Add support for more streaming platforms

## Contributing

When adding new voice functionality:

1. Identify the appropriate module (or create a new one)
2. Keep functions focused and single-purpose
3. Document parameters and return values
4. Add JSDoc comments for type hints
5. Consider thread-safety for queue operations
6. Update this README with new functionality
