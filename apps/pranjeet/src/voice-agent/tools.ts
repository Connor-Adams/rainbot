/**
 * Voice Agent tool definitions for xAI realtime API.
 * Used when GROK_VOICE_AGENT_TOOLS is enabled and executeCommand is provided.
 * Prompt assembly and personas live under ../prompts.
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
  {
    type: 'function',
    name: 'get_playback_status',
    description:
      'Get the current music playback status (e.g. playing, paused, idle), what is currently playing, and the last playback error if something recently failed.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];
