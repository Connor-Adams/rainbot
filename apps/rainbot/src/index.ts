import { createRainbotRouter } from '@rainbot/rpc';
import {
  createWorkerDiscordClient,
  loginDiscordClient,
  registerWithOrchestrator,
  RequestCache,
  setupAutoFollowVoiceStateHandler,
  setupDiscordClientErrorHandler,
  setupDiscordClientReadyHandler,
  setupProcessErrorHandlers,
  type GuildState,
} from '@rainbot/worker-shared';
import {
  hasOrchestrator,
  hasToken,
  log,
  ORCHESTRATOR_BOT_ID,
  PORT,
  RAINCLOUD_URL,
  TOKEN,
  WORKER_SECRET,
} from './config';
import { createApp } from './app';
import { getOrCreateGuildState, guildStates } from './state/guild-state';
import { createRpcHandlers } from './handlers/rpc';
import { registerVoiceStateHandlers } from './events/voice-state';
import { fetchAndSetYtCookies } from './voice/ytCookies';

setupProcessErrorHandlers(log);

log.info('Starting Rainbot');
log.info(`Starting (pid=${process.pid}, node=${process.version})`);
log.info(`Config: port=${PORT}, hasToken=${hasToken}, hasOrchestrator=${hasOrchestrator}`);
log.info(
  `Worker registration config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);

if (!hasToken) {
  log.error('RAINBOT_TOKEN environment variable is required');
}
if (!hasOrchestrator) {
  log.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
}

const requestCache = new RequestCache();
const client = createWorkerDiscordClient();
setupDiscordClientErrorHandler(client, log);

const handlers = createRpcHandlers({ client, requestCache });
const router = createRainbotRouter(handlers);
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

// Fetch YouTube cookies from raincloud (if configured via UI) before setup runs
// so cookies are available before first play.
void fetchAndSetYtCookies();

setupDiscordClientReadyHandler(client, {
  orchestratorBotId: ORCHESTRATOR_BOT_ID,
  logger: log,
  onReady: () => {
    startServer();
    void registerWithOrchestrator({
      botType: 'rainbot',
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
