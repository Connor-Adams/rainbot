import { createWorkerDiscordClient } from '@rainbot/worker-shared';
import {
  createJoinHandler,
  createLeaveHandler,
  createVolumeHandler,
  createSpeakHandler,
} from '@rainbot/worker-shared';
import type { RequestCache } from '@rainbot/worker-shared';
import { log } from '../config';
import { getOrCreateGuildState, getStateForRpc, guildStates } from '../state/guild-state';
import { speakInGuild } from '../speak';
import { getGrokReply } from '../chat/grok';
import { getGrokPersona } from '../redis';
import { startListeningForChannelMembers } from '../events/voice-state';
import { getVoiceInteractionManager } from '@rainbot/utils/voice/voiceInteractionInstance';
import type { Client } from 'discord.js';

export interface PranjeetRpcDeps {
  client: ReturnType<typeof createWorkerDiscordClient>;
  requestCache: RequestCache;
}

export function createRpcHandlers(deps: PranjeetRpcDeps) {
  const { client, requestCache } = deps;

  const sharedOptions = {
    client,
    requestCache,
    getOrCreateGuildState: (guildId: string) =>
      getOrCreateGuildState(guildId) as import('@rainbot/worker-shared').GuildState,
    guildStates: guildStates as unknown as Map<string, import('@rainbot/worker-shared').GuildState>,
    log,
    onVolumeChange: (state: import('@rainbot/worker-shared').GuildState, volume: number) => {
      const s = state as {
        currentResource?: { volume?: { setVolume: (n: number) => void } } | null;
      };
      if (s.currentResource?.volume) s.currentResource.volume.setVolume(volume);
    },
  };

  const join = createJoinHandler(sharedOptions);
  const leave = createLeaveHandler(sharedOptions);
  const volume = createVolumeHandler(sharedOptions);
  const speak = createSpeakHandler({
    requestCache,
    log,
    speakInGuild: (guildId, text, voice) => speakInGuild(guildId, text, voice),
  });

  async function grokChat(input: {
    guildId: string;
    userId: string;
    text: string;
  }): Promise<{ reply: string }> {
    const personaId = await getGrokPersona(input.guildId, input.userId);
    const reply = await getGrokReply(
      input.guildId,
      input.userId,
      input.text,
      personaId ?? undefined
    );
    return { reply };
  }

  /**
   * Conversation mode turned on/off from Raincloud (/chat). On enable, start
   * listening to everyone currently in the channel so the user doesn't have to
   * rejoin — the existing-member subscription otherwise only fires on bot join.
   */
  async function setConversationListening(input: {
    guildId: string;
    enabled: boolean;
  }): Promise<{ success: boolean }> {
    const mgr = getVoiceInteractionManager();
    if (!mgr) return { success: false };
    if (!input.enabled) {
      await mgr.disableForGuild(input.guildId);
      return { success: true };
    }
    await mgr.enableForGuild(input.guildId);
    const state = guildStates.get(input.guildId);
    if (state?.connection) {
      await startListeningForChannelMembers(
        client as unknown as Client,
        input.guildId,
        state.connection
      );
    } else {
      log.warn(`setConversationListening: no voice connection for guild ${input.guildId} yet`);
    }
    return { success: true };
  }

  return {
    getState: getStateForRpc,
    join,
    leave,
    volume,
    speak,
    grokChat,
    setConversationListening,
  };
}
