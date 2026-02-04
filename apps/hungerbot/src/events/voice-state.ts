import { Client, Events } from 'discord.js';
import { ORCHESTRATOR_BOT_ID } from '../config';
import { guildStates } from '../state/guild-state';

export function registerVoiceStateHandlers(client: Client): void {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (
      newState.member?.id === ORCHESTRATOR_BOT_ID ||
      oldState.member?.id === ORCHESTRATOR_BOT_ID
    ) {
      const guildId = newState.guild?.id || oldState.guild?.id;
      if (!guildId) return;

      const orchestratorLeft = oldState.channelId && !newState.channelId;
      if (orchestratorLeft) {
        const state = guildStates.get(guildId);
        if (state?.connection) {
          state.player.stop(true);
        }
      }
    }
  });
}
