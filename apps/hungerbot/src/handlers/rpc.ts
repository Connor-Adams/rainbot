import {
  createWorkerDiscordClient,
  reportSoundStat,
  createJoinHandler,
  createLeaveHandler,
  createVolumeHandler,
  createPlaySoundHandler,
  createCleanupUserHandler,
  sniffSoundStream,
} from '@rainbot/worker-shared';
import type { RequestCache } from '@rainbot/worker-shared';
import { recordSoundPlay, RainbotAttr } from '@rainbot/observability/node';
import { log } from '../config';
import { getOrCreateGuildState, getStateForRpc, guildStates } from '../state/guild-state';
import { getSoundStream } from '../storage/sounds';

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
    createSoundResource: async (input) => {
      // Timed separately from the rest of sound.play (resource creation +
      // issuing playback, timed in voiceRpcHandlers.ts): a slow R2 bucket and
      // a slow decode are different problems and should be distinguishable
      // in the rainbot.sound.play.duration histogram.
      const fetchStarted = Date.now();
      const stream = await getSoundStream(input.sfxId);
      recordSoundPlay(Date.now() - fetchStarted, {
        [RainbotAttr.sound]: input.sfxId,
        [RainbotAttr.phase]: 'fetch',
      });
      return sniffSoundStream(stream);
    },
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
