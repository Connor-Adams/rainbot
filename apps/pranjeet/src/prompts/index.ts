import { getCustomPersona } from '../redis';
import { buildVoiceInstructions } from './voice';
import { getPersona as getPersonaFromRegistry, DEFAULT_PERSONA_ID } from './personas';
import type { Persona } from './types';

export type { Persona } from './types';
export { getPersona, DEFAULT_PERSONA_ID, PERSONAS } from './personas';

const FALLBACK_SYSTEM_PROMPT =
  'You are a rude, chaotic assistant. Stay in character. Use a consistent accent for the entire response.';

/**
 * Resolve persona by id: built-in first, then custom from Redis. Returns null if not found.
 */
export async function getPersonaWithCustom(id: string): Promise<Persona | null> {
  const builtIn = getPersonaFromRegistry(id);
  if (builtIn) return builtIn;
  const custom = await getCustomPersona(id);
  return custom;
}

/**
 * Returns the system prompt for chat completions. Uses default persona if personaId is omitted or not found.
 */
export async function getSystemPromptForChat(personaId?: string): Promise<string> {
  const id = personaId ?? DEFAULT_PERSONA_ID;
  const persona = await getPersonaWithCustom(id);
  return persona?.systemPrompt ?? FALLBACK_SYSTEM_PROMPT;
}

/**
 * Returns full session.instructions for the Voice Agent. Uses default persona if personaId is omitted or not found.
 * Never returns empty string.
 */
export async function getVoiceAgentInstructions(
  personaId?: string,
  withTools = false
): Promise<string> {
  const id = personaId ?? DEFAULT_PERSONA_ID;
  const persona = await getPersonaWithCustom(id);
  const body = persona?.systemPrompt ?? '';
  return buildVoiceInstructions(body, withTools);
}
