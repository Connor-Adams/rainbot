import { type Client, Events } from 'discord.js';
import { ORCHESTRATOR_BOT_ID } from '../config';
import { guildStates } from '../state/guild-state';

/**
 * Rainbot-specific extension to the shared auto-follow voice-state handler:
 * when the orchestrator leaves the channel, also clear the queue and
 * currentTrack (the shared handler stops the connection; this clears
 * music-specific state).
 */
export function registerVoiceStateHandlers(client: Client): void {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (
      newState.member?.id !== ORCHESTRATOR_BOT_ID &&
      oldState.member?.id !== ORCHESTRATOR_BOT_ID
    ) {
      return;
    }
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    const orchestratorLeft = oldState.channelId && !newState.channelId;
    if (!orchestratorLeft) return;

    const state = guildStates.get(guildId);
    if (state) {
      state.queue = [];
      state.currentTrack = null;
    }
  });
}
