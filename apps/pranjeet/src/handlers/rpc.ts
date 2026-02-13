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

  return {
    getState: getStateForRpc,
    join,
    leave,
    volume,
    speak,
    grokChat,
  };
}
