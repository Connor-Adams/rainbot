/**
 * Response builders for Discord slash commands.
 * Single reply shape: every reply uses { content?, embeds?, components?, flags? }.
 */

const { MessageFlags } = require('discord.js');

// --- Shared message constants (centralized copy and emoji) ---

const NOT_IN_VOICE = "❌ I'm not in a voice channel! Use `/join` first.";
const WORKER_UNAVAILABLE = 'Error: worker services are not ready. Please try again in a moment.';
const NOTHING_PLAYING = '❌ Nothing is playing right now. Use `/play` to start playback.';
const TIP_JOIN_FIRST = 'Use `/join` first.';

// --- Reply builders ---

/**
 * Public success message. No ephemeral.
 * @param {string} content
 * @param {{ components?: import('discord.js').ActionRowBuilder[] }} [options]
 * @returns {{ content: string, components?: import('discord.js').ActionRowBuilder[] }}
 */
function replySuccess(content, options = {}) {
  const payload = { content };
  if (options.components?.length) payload.components = options.components;
  return payload;
}

/**
 * Error reply (ephemeral). Same shape as legacy createErrorResponse.
 * @param {Error | string} error - Error instance or message string
 * @param {string} [context] - Optional context prefix (e.g. "Failed to set volume")
 * @param {string} [tip] - Optional tip line (e.g. "💡 Make sure something is playing.")
 * @returns {{ content: string, flags: number }}
 */
function replyError(error, context = '', tip = '') {
  const message = typeof error === 'object' && error?.message ? error.message : String(error);
  const contextPrefix = context ? `${context}: ` : '';
  const tipSuffix = tip ? `\n\n${tip}` : '';
  return {
    content: `❌ ${contextPrefix}${message}${tipSuffix}`,
    flags: MessageFlags.Ephemeral,
  };
}

/**
 * Standard "not in voice" reply (ephemeral).
 * @returns {{ content: string, flags: number }}
 */
function replyNotInVoice() {
  return {
    content: NOT_IN_VOICE,
    flags: MessageFlags.Ephemeral,
  };
}

/**
 * Workers not ready (ephemeral).
 * @returns {{ content: string, flags: number }}
 */
function replyWorkerUnavailable() {
  return {
    content: WORKER_UNAVAILABLE,
    flags: MessageFlags.Ephemeral,
  };
}

/**
 * Confirmation dialog (ephemeral).
 * @param {string} content
 * @param {import('discord.js').ActionRowBuilder[]} components
 * @returns {{ content: string, components: import('discord.js').ActionRowBuilder[], flags: number }}
 */
function replyConfirm(content, components) {
  return {
    content,
    components,
    flags: MessageFlags.Ephemeral,
  };
}

/**
 * Generic payload; ephemeral option becomes flags.
 * @param {{ content?: string, embeds?: import('discord.js').EmbedBuilder[], components?: import('discord.js').ActionRowBuilder[], ephemeral?: boolean }} options
 * @returns {import('discord.js').InteractionReplyOptions & { fetchReply?: boolean }}
 */
function replyPayload({ content, embeds, components, ephemeral }) {
  const payload = {};
  if (content !== undefined) payload.content = content;
  if (embeds?.length) payload.embeds = embeds;
  if (components?.length) payload.components = components;
  if (ephemeral) payload.flags = MessageFlags.Ephemeral;
  return payload;
}

// Legacy names for backward compatibility (commandHelpers re-exports these)
function createErrorResponse(error, context = '', additionalTip = '') {
  return replyError(error, context, additionalTip);
}

function createWorkerUnavailableResponse() {
  return replyWorkerUnavailable();
}

module.exports = {
  NOT_IN_VOICE,
  WORKER_UNAVAILABLE,
  NOTHING_PLAYING,
  TIP_JOIN_FIRST,
  replySuccess,
  replyError,
  replyNotInVoice,
  replyWorkerUnavailable,
  replyConfirm,
  replyPayload,
  createErrorResponse,
  createWorkerUnavailableResponse,
};
