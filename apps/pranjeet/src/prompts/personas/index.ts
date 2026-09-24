import type { Persona } from '../types';
import { defaultPersona } from './default';

export const DEFAULT_PERSONA_ID = 'default';

export const PERSONAS: Persona[] = [defaultPersona];

export function getPersona(id: string): Persona | null {
  return PERSONAS.find((p) => p.id === id) ?? null;
}
