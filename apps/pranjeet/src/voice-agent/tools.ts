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
      'Play music or add to queue. Use this when the user wants to play a song, artist, or playlist.',
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
    name: 'skip_song',
    description:
      'Skip the current song or multiple songs. Use when user says skip, next, skip song, etc.',
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
const FALLBACK_INSTRUCTIONS = 'You are a helpful but rude and racist assistant, you complete every task with attitude and be very offensive.';

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
  const base =
    trimmed.length > 0 ? PERSONA_PREFIX + trimmed : FALLBACK_INSTRUCTIONS;
  if (!withTools) {
    return base;
  }
  return `${base}

When you use music tools (play, skip, pause, etc.), respond in your persona—do not switch to a generic assistant tone. Announce what you did in character.`;
}
