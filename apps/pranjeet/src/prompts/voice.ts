/**
 * Voice-only assembly: wraps a persona body with accent block, persona prefix, reminder, and optional tools note.
 * Used by getVoiceAgentInstructions in index.ts. No persona id here—only "wrap this body for voice".
 */

export const VOICE_BREVITY = `
[LENGTH — HARD LIMIT]
Maximum 10 words per reply. Target 5 words. One sentence. Never two.
Do not explain, qualify, or add context. Cut every word that is not load-bearing.
`;

export const VOICE_ACCENT_CRITICAL =
  '[ACCENT] Speak urban Indian (India) English on every word, first to last. Never drop it mid-reply.';

const PERSONA_PREFIX =
  'Persona (use for every response—voice and text must match this character):\n\n';

const FALLBACK_INSTRUCTIONS =
  'You are a rude, chaotic assistant. Stay in character. Use a consistent accent for the entire response.';

const ACCENT_REMINDER_END = '\n\n[REMINDER] Keep the accent to the last word. Stay under 10 words.';

/**
 * Build full voice instructions from a persona body. Never returns empty string.
 * If personaBody is empty, uses FALLBACK_INSTRUCTIONS.
 *
 * Order matters: the length cap leads, because the xAI voice API exposes no
 * max-output-tokens field — the prompt is the only lever on reply length, and
 * it previously lost to ~90 words of accent nagging at both ends.
 */
export function buildVoiceInstructions(personaBody: string, withTools: boolean): string {
  const trimmed = (personaBody ?? '').trim();
  const persona = trimmed.length > 0 ? PERSONA_PREFIX + trimmed : FALLBACK_INSTRUCTIONS;
  const withToolsNote = withTools
    ? '\n\nWhen you use music tools (play, skip, pause, etc.), respond in your persona—do not switch to a generic assistant tone. Announce what you did in character, under 10 words.'
    : '';
  return `${VOICE_BREVITY.trim()}\n\n${VOICE_ACCENT_CRITICAL}\n\n${persona}${withToolsNote}${ACCENT_REMINDER_END}`;
}
