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
} from './audioResource.ts';

// Queue management
export {
  addToQueue,
  skip,
  clearQueue,
  removeTrackFromQueue,
  getQueue,
  restoreQueue,
  withQueueLock,
} from './queueManager.ts';

// Playback
export {
  playNext,
  togglePause,
  stopSound,
  setVolume,
  playSoundImmediate,
  playSoundboardOverlay,
  playWithVolume,
} from './playbackManager.ts';

// Soundboard
export {
  trackSoundboardUsage,
  playSoundboardDirect,
  playSoundboardOverlay as playSoundboardOverlayFull,
} from './soundboardManager.ts';

// Snapshots
export {
  saveQueueSnapshot,
  saveAllQueueSnapshots,
  restoreQueueSnapshot,
  restoreAllQueueSnapshots,
  startAutoSave,
  stopAutoSave,
} from './snapshotPersistence.ts';

// Playback with seek (for crash recovery)
export { playWithSeek } from './playbackManager.ts';

// Track metadata
export {
  fetchYouTubeMetadata,
  fetchYouTubePlaylist,
  searchYouTube,
  spotifyToYouTube,
  processSpotifyPlaylistTracks,
  detectUrlType,
} from './trackMetadata.ts';

// Track fetcher
export { fetchTracks } from './trackFetcher.ts';

// Connection management
export {
  joinChannel,
  leaveChannel,
  getVoiceState,
  getAllConnections,
  voiceStates,
} from './connectionManager.ts';

// Constants
export * as constants from './constants.ts';
