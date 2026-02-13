import { buildVoiceInstructions } from './voice';
import { getPersona as getPersonaFromRegistry, DEFAULT_PERSONA_ID } from './personas';

export type { Persona } from './types';
export { getPersona, DEFAULT_PERSONA_ID, PERSONAS } from './personas';

const FALLBACK_SYSTEM_PROMPT =
  'You are a rude, chaotic assistant. Stay in character. Use a consistent accent for the entire response.';

/**
 * Returns the system prompt for chat completions. Uses default persona if personaId is omitted or not found.
 */
export function getSystemPromptForChat(personaId?: string): string {
  const id = personaId ?? DEFAULT_PERSONA_ID;
  const persona = getPersonaFromRegistry(id);
  return persona?.systemPrompt ?? FALLBACK_SYSTEM_PROMPT;
}

/**
 * Returns full session.instructions for the Voice Agent. Uses default persona if personaId is omitted or not found.
 * Never returns empty string.
 */
export function getVoiceAgentInstructions(personaId?: string, withTools = false): string {
  const id = personaId ?? DEFAULT_PERSONA_ID;
  const persona = getPersonaFromRegistry(id);
  const body = persona?.systemPrompt ?? '';
  return buildVoiceInstructions(body, withTools);
}
