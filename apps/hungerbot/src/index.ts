import { createHungerbotRouter } from '@rainbot/rpc';
import {
  setupProcessErrorHandlers,
  registerWithOrchestrator,
  RequestCache,
  createWorkerDiscordClient,
  setupDiscordClientErrorHandler,
  setupDiscordClientReadyHandler,
  loginDiscordClient,
  setupAutoFollowVoiceStateHandler,
  type GuildState,
} from '@rainbot/worker-shared';
import {
  log,
  PORT,
  TOKEN,
  ORCHESTRATOR_BOT_ID,
  RAINCLOUD_URL,
  hasToken,
  hasOrchestrator,
  WORKER_SECRET,
} from './config';
import { createApp } from './app';
import { getOrCreateGuildState, guildStates } from './state/guild-state';
import { createRpcHandlers } from './handlers/rpc';
import { registerVoiceStateHandlers } from './events/voice-state';

setupProcessErrorHandlers(log);

log.info('Starting Hungerbot');
log.info(`Starting (pid=${process.pid}, node=${process.version})`);
log.info(`Config: port=${PORT}, hasToken=${hasToken}, hasOrchestrator=${hasOrchestrator}`);
log.info(
  `Worker registration config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);
log.info(
  `Stats reporting config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);

if (!hasToken) {
  log.error('HUNGERBOT_TOKEN environment variable is required');
}
if (!hasOrchestrator) {
  log.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
}

const requestCache = new RequestCache();
const client = createWorkerDiscordClient();
setupDiscordClientErrorHandler(client, log);

const handlers = createRpcHandlers({ client, requestCache });
const router = createHungerbotRouter(handlers);
const { startServer } = createApp({
  router,
  getClient: () => client,
});

if (ORCHESTRATOR_BOT_ID) {
  setupAutoFollowVoiceStateHandler(client, {
    orchestratorBotId: ORCHESTRATOR_BOT_ID,
    guildStates: guildStates as unknown as Map<string, GuildState>,
    getOrCreateGuildState: (guildId: string) =>
      getOrCreateGuildState(guildId) as unknown as GuildState,
    logger: log,
  });
} else {
  log.warn('ORCHESTRATOR_BOT_ID not set; auto-follow voice state handler disabled');
}

registerVoiceStateHandlers(client);

setupDiscordClientReadyHandler(client, {
  orchestratorBotId: ORCHESTRATOR_BOT_ID,
  logger: log,
  onReady: () => {
    startServer();
    void registerWithOrchestrator({
      botType: 'hungerbot',
      logger: log,
    });
  },
});

void loginDiscordClient(client, TOKEN, {
  logger: log,
  onDegraded: () => {
    startServer();
  },
});
