/**
 * Voice Agent tool definitions for xAI realtime API.
 * Used when GROK_VOICE_AGENT_TOOLS is enabled and executeCommand is provided.
 * Keeps grokVoiceAgent.ts focused on connection/audio; persona comes from grok.ts.
 */

export interface VoiceAgentTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

/** Music control tools sent in session.update when tools are enabled. */
export const VOICE_AGENT_MUSIC_TOOLS: VoiceAgentTool[] = [
  {
    type: 'function',
    name: 'play_music',
    description:
      'Play music or add to queue. Use when the user wants to play a song, artist, or playlist. Do NOT use for "skip and play" or "skip and add to queue"—use skip_and_play instead so the current track is skipped first.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Song name, artist name, YouTube URL, Spotify URL, or search query',
        },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'skip_and_play',
    description:
      'Skip the current track (works even when paused—removes it and starts the next) and optionally play or add a new song. Use when the user says skip and play X, skip and add to queue, next and play something, etc. Always prefer this over calling skip_song then play_music so the current track is removed first. Pass query when they want to play/add something after skipping; omit query to just skip.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Optional. Song/artist/URL to play or add after skipping. Omit if user only wants to skip.',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'skip_song',
    description:
      'Skip the current song or multiple songs (works when paused—current track is removed and next plays). Use when user says only skip, next, skip song (no "and play" or "and add"). For "skip and play X" use skip_and_play instead.',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of songs to skip (default: 1)',
        },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'pause_music',
    description:
      'Pause the currently playing music. Use when user says pause, stop playing, hold on, etc.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'resume_music',
    description:
      'Resume paused music. Use when user says resume, continue, unpause, keep going, etc.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'stop_music',
    description:
      'Stop playback and clear the queue. Use when user says stop, stop music, clear queue, etc.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'set_volume',
    description: 'Set the playback volume. Use when user wants to change volume.',
    parameters: {
      type: 'object',
      properties: {
        volume: {
          type: 'number',
          description: 'Volume level from 0 to 100',
        },
      },
      required: ['volume'],
    },
  },
  {
    type: 'function',
    name: 'clear_queue',
    description: 'Clear the music queue. Use when user says clear queue, clear, empty queue, etc.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

/** Prefix so the realtime model clearly treats the following block as the required persona. */
const PERSONA_PREFIX =
  'Persona (use for every response—voice and text must match this character):\n\n';

/** Fallback if persona is missing; xAI requires session.instructions to be a non-empty string. */
const FALLBACK_INSTRUCTIONS =
  'You are a rude, chaotic assistant. Stay in character. Use a consistent accent for the entire response.';

/**
 * Build session.instructions for the Voice Agent (xAI system prompt).
 * @see https://docs.x.ai/developers/model-capabilities/audio/voice-agent#session-messages
 * Session Parameters: instructions (string) = System prompt.
 *
 * Uses the same persona as grok.ts (GROK_SYSTEM_PROMPT). Never returns empty string.
 * When tools are enabled we append a short reminder to stay in character when calling music tools.
 */
export function getVoiceAgentInstructions(personaPrompt: string, withTools: boolean): string {
  const trimmed = (personaPrompt ?? '').trim();
  const base = trimmed.length > 0 ? PERSONA_PREFIX + trimmed : FALLBACK_INSTRUCTIONS;
  if (!withTools) {
    return base;
  }
  return `${base}

When you use music tools (play, skip, pause, etc.), respond in your persona—do not switch to a generic assistant tone. Announce what you did in character.`;
}
