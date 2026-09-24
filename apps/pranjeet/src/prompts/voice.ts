/**
 * Voice-only assembly: wraps a persona body with accent block, persona prefix, reminder, and optional tools note.
 * Used by getVoiceAgentInstructions in index.ts. No persona id here—only "wrap this body for voice".
 */

const VOICE_ACCENT_CRITICAL = `
[MANDATORY — EVERY RESPONSE]
You speak in an urban Indian (India) English accent. This accent applies to EVERY word you say from the first to the last. Do NOT use the accent only at the start and then switch to neutral or American. The last word of your response must sound as clearly accented as the first. Same rhythm, same cadence, same phrasing throughout the entire reply. Never drop the accent mid-response.
`;

const PERSONA_PREFIX =
  'Persona (use for every response—voice and text must match this character):\n\n';

const FALLBACK_INSTRUCTIONS =
  'You are a rude, chaotic assistant. Stay in character. Use a consistent accent for the entire response.';

const ACCENT_REMINDER_END =
  '\n\n[REMINDER] Keep the Indian English accent on every word until you finish speaking. Do not switch to neutral after the first phrase.';

/**
 * Build full voice instructions from a persona body. Never returns empty string.
 * If personaBody is empty, uses FALLBACK_INSTRUCTIONS.
 */
export function buildVoiceInstructions(personaBody: string, withTools: boolean): string {
  const trimmed = (personaBody ?? '').trim();
  const persona = trimmed.length > 0 ? PERSONA_PREFIX + trimmed : FALLBACK_INSTRUCTIONS;
  const withToolsNote = withTools
    ? '\n\nWhen you use music tools (play, skip, pause, etc.), respond in your persona—do not switch to a generic assistant tone. Announce what you did in character.'
    : '';
  return `${VOICE_ACCENT_CRITICAL.trim()}\n\n${persona}${withToolsNote}${ACCENT_REMINDER_END}`;
}
