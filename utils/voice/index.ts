// util-category: audio
/**
 * Voice module exports
 * This serves as the main entry point for voice-related functionality
 */

// Audio resources
export {
  createVolumeResource,
  getStreamUrl,
  createTrackResourceAsync,
  createTrackResource,
  createTrackResourceForAny,
  createResourceWithSeek,
} from './audioResource';

// Queue management
export {
  addToQueue,
  skip,
  clearQueue,
  removeTrackFromQueue,
  getQueue,
  restoreQueue,
  withQueueLock,
} from './queueManager';

// Playback
export {
  playNext,
  togglePause,
  stopSound,
  setVolume,
  playSoundImmediate,
  playSoundboardOverlay,
  playWithVolume,
} from './playbackManager';

// Soundboard
export {
  trackSoundboardUsage,
  playSoundboardDirect,
  playSoundboardOverlay as playSoundboardOverlayFull,
} from './soundboardManager';

// Snapshots
export {
  saveQueueSnapshot,
  saveAllQueueSnapshots,
  restoreQueueSnapshot,
  restoreAllQueueSnapshots,
  startAutoSave,
  stopAutoSave,
} from './snapshotPersistence';

// Playback with seek (for crash recovery)
export { playWithSeek } from './playbackManager';

// Track metadata
export {
  fetchYouTubeMetadata,
  fetchYouTubePlaylist,
  searchYouTube,
  spotifyToYouTube,
  processSpotifyPlaylistTracks,
  detectUrlType,
} from './trackMetadata';

// Track fetcher
export { fetchTracks } from './trackFetcher';

// Connection management
export {
  joinChannel,
  leaveChannel,
  getVoiceState,
  getAllConnections,
  voiceStates,
} from './connectionManager';

// Constants
export * as constants from './constants';
