/**
 * Persona definition for chat and voice. Used by the prompts registry and for future UI switchable personas.
 */
export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
}
