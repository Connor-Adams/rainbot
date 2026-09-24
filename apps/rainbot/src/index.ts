// Telemetry must be the first import: OpenTelemetry's auto-instrumentation
// patches http/express/redis/etc at require time, so anything imported above
// this line would be invisible to tracing. Preferred long-term fix is a
// `--require ./dist/telemetry.js` preload on the node invocation, which makes
// this ordering structurally impossible to break instead of relying on
// convention — deferred because it needs a Dockerfile CMD change across all
// three worker images, and this branch is about to ship to production
// containers that can't be test-built locally right now. Until then,
// __tests__/telemetry-import-order.test.ts asserts this stays first.
import './telemetry';

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
import { fetchAndSetYtCookies, startYtCookieRefresh } from './voice/ytCookies';
import { fetchAndSetYtProxy, startYtProxyRefresh } from './voice/ytProxy';

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
// so cookies are available before first play, then keep them fresh so a
// dashboard upload lands without restarting this worker.
void fetchAndSetYtCookies();
startYtCookieRefresh();

// Same story for the outbound proxy: load it before the first play, then keep
// it current so a dashboard change applies without a restart.
void fetchAndSetYtProxy();
startYtProxyRefresh();

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
