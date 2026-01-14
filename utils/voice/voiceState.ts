// util-category: audio
import type { VoiceState } from '@rainbot/protocol';
import * as connectionManager from './connectionManager';

/**
 * INTERNAL: fetch current state
 */
function getState(guildId: string): VoiceState | null {
  return connectionManager.getVoiceState(guildId);
}

/**
 * SINGLE mutation entrypoint.
 * This is the ONLY place where VoiceState may be mutated.
 */
function apply(
  guildId: string,
  mutator: (state: VoiceState) => void
): void {
  const state = getState(guildId);
  if (!state) return;

  mutator(state);
}

/* ============================================================================
 * INTENT-BASED STATE WRITES
 * ============================================================================
 */

/**
 * Update the "last actor" consistently.
 * All actor fields are always updated together.
 */
export function setLastActor(
  guildId: string,
  actor: {
    userId: string;
    username?: string;
    discriminator?: string;
  }
): void {
  apply(guildId, (state) => {
    state.lastUserId = actor.userId;
    state.lastUsername = actor.username ?? null;
    state.lastDiscriminator = actor.discriminator ?? null;
  });
}

/**
 * Clear last actor (leave, stop, etc)
 */
export function clearLastActor(guildId: string): void {
  apply(guildId, (state) => {
    state.lastUserId = null;
    state.lastUsername = null;
    state.lastDiscriminator = null;
  });
}

/**
 * Explicit autoplay toggle
 */
export function setAutoplay(guildId: string, enabled: boolean): void {
  apply(guildId, (state) => {
    state.autoplay = enabled;
  });
}