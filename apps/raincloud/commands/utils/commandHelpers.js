/**
 * Command utilities for Discord bot commands
 * Provides reusable helpers to reduce duplication across command files
 */

const { MessageFlags } = require('discord.js');
const { getYouTubeThumbnailUrl } = require('@rainbot/shared');
const {
  createErrorResponse,
  createWorkerUnavailableResponse,
  NOT_IN_VOICE,
} = require('./responseBuilder');

/**
 * Get the initialized MultiBotService instance if available.
 */
async function getMultiBotService() {
  try {
    const { MultiBotService } = require('../../dist/apps/raincloud/lib/multiBotService');
    if (MultiBotService.isInitialized()) {
      return MultiBotService.getInstance();
    }
  } catch {
    // Multi-bot service not available
  }
  return null;
}

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
        content: NOT_IN_VOICE,
        flags: MessageFlags.Ephemeral,
      },
    };
  }
  return { isValid: true };
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
 * Get YouTube thumbnail URL from video URL or ID.
 * Uses shared parser for consistent handling of all YouTube URL formats.
 */
function getYouTubeThumbnail(url) {
  return getYouTubeThumbnailUrl(url);
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
        flags: MessageFlags.Ephemeral,
      },
    };
  }
  return { hasPermissions: true };
}

module.exports = {
  getMultiBotService,
  createWorkerUnavailableResponse,
  validateVoiceConnection,
  createErrorResponse,
  formatDuration,
  getYouTubeThumbnail,
  checkVoicePermissions,
};
