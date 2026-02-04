import {
  createWorkerDiscordClient,
  reportSoundStat,
  createJoinHandler,
  createLeaveHandler,
  createVolumeHandler,
  createPlaySoundHandler,
  createCleanupUserHandler,
} from '@rainbot/worker-shared';
import type { RequestCache } from '@rainbot/worker-shared';
import { log } from '../config';
import { getOrCreateGuildState, getStateForRpc, guildStates } from '../state/guild-state';
import { getSoundStream, getSoundInputType } from '../storage/sounds';

export interface HungerbotRpcDeps {
  client: ReturnType<typeof createWorkerDiscordClient>;
  requestCache: RequestCache;
}

export function createRpcHandlers(deps: HungerbotRpcDeps) {
  const { client, requestCache } = deps;

  const sharedOptions = {
    client,
    requestCache,
    getOrCreateGuildState: (guildId: string) =>
      getOrCreateGuildState(guildId) as import('@rainbot/worker-shared').GuildState,
    guildStates: guildStates as unknown as Map<string, import('@rainbot/worker-shared').GuildState>,
    log,
    onBeforeLeave: (state: import('@rainbot/worker-shared').GuildState) => {
      state.player.stop();
    },
  };

  const join = createJoinHandler(sharedOptions);
  const leave = createLeaveHandler(sharedOptions);
  const volume = createVolumeHandler(sharedOptions);
  const playSound = createPlaySoundHandler({
    requestCache,
    log,
    getOrCreateGuildState: (guildId) =>
      getOrCreateGuildState(guildId) as import('@rainbot/worker-shared').GuildState,
    createSoundResource: async (input) => ({
      stream: await getSoundStream(input.sfxId),
      inputType: getSoundInputType(input.sfxId),
    }),
    reportStat: (input, opts) => {
      void reportSoundStat(
        {
          soundName: input.sfxId,
          userId: input.userId,
          guildId: input.guildId,
          sourceType: 'local',
          isSoundboard: true,
          duration: null,
          source: 'discord',
        },
        { logger: opts?.logger }
      );
    },
  });
  const cleanupUser = createCleanupUserHandler({
    guildStates: guildStates as unknown as Map<string, import('@rainbot/worker-shared').GuildState>,
  });

  return {
    getState: getStateForRpc,
    join,
    leave,
    volume,
    playSound,
    cleanupUser,
  };
}
