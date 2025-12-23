/**
 * Voice module exports
 * This serves as the main entry point for voice-related functionality
 */

module.exports = {
    // Audio resources
    ...require('./audioResource'),
    
    // Queue management
    ...require('./queueManager'),
    
    // Playback
    ...require('./playbackManager'),
    
    // Soundboard
    ...require('./soundboardManager'),
    
    // Snapshots
    ...require('./snapshotManager'),
    
    // Track metadata
    ...require('./trackMetadata'),
    
    // Constants
    constants: require('./constants'),
};
