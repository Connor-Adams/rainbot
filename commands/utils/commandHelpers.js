/**
 * Command utilities for Discord bot commands
 * Provides reusable helpers to reduce duplication across command files
 */

/**
 * Check if bot is connected to a voice channel in the guild
 * Returns an error response if not connected
 */
function validateVoiceConnection(interaction, voiceManager) {
  const status = voiceManager.getStatus(interaction.guildId);
  if (!status) {
    return {
      isValid: false,
      error: {
        content:
          "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
        ephemeral: true,
      },
    };
  }
  return { isValid: true };
}

/**
 * Standard error response handler for commands
 */
function createErrorResponse(error, context = '') {
  const message = error.message || 'An unknown error occurred';
  return {
    content: `❌ ${context ? `${context}: ` : ''}${message}`,
    ephemeral: true,
  };
}

/**
 * Format duration in seconds to human-readable string (MM:SS or HH:MM:SS)
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get YouTube thumbnail URL from video URL
 */
function getYouTubeThumbnail(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  }
  return null;
}

/**
 * Check if user has required voice channel permissions
 */
function checkVoicePermissions(voiceChannel, botUser) {
  const permissions = voiceChannel.permissionsFor(botUser);
  const missingPerms = [];
  if (!permissions.has('Connect')) missingPerms.push('Connect');
  if (!permissions.has('Speak')) missingPerms.push('Speak');

  if (missingPerms.length > 0) {
    return {
      hasPermissions: false,
      error: {
        content: `❌ I need the following permissions in **${voiceChannel.name}**: ${missingPerms.join(', ')}\n\n💡 Ask a server administrator to grant these permissions.`,
        ephemeral: true,
      },
    };
  }
  return { hasPermissions: true };
}

module.exports = {
  validateVoiceConnection,
  createErrorResponse,
  formatDuration,
  getYouTubeThumbnail,
  checkVoicePermissions,
};
