import type {
  VoiceInteractionSession,
  ParsedVoiceCommand,
  VoiceCommandResult,
} from '@rainbot/protocol';
import { createContext, createPranjeetRouter } from '@rainbot/rpc';
import {
  setupProcessErrorHandlers,
  getOrchestratorBaseUrl,
  registerWithOrchestrator,
  RequestCache,
  createWorkerDiscordClient,
  setupDiscordClientReadyHandler,
  loginDiscordClient,
  setupAutoFollowVoiceStateHandler,
  type GuildState,
} from '@rainbot/worker-shared';
import { initVoiceInteractionManager } from '@voice/voiceInteractionInstance';
import {
  log,
  PORT,
  TOKEN,
  ORCHESTRATOR_BOT_ID,
  RAINCLOUD_URL,
  REDIS_URL,
  hasToken,
  hasOrchestrator,
  WORKER_SECRET,
  VOICE_INTERACTION_ENABLED,
  VOICE_TRIGGER_WORD,
  GROK_ENABLED,
  GROK_API_KEY,
  STT_API_KEY,
  TTS_API_KEY,
  TTS_VOICE,
} from './config';
import { createApp } from './app';
import { getOrCreateGuildState, guildStates } from './state/guild-state';
import { createRpcHandlers } from './handlers/rpc';
import { registerVoiceStateHandlers } from './events/voice-state';
import { initTTS } from './tts';
import { speakInGuild } from './speak';
import { startTtsQueue } from './queue/tts-worker';
import { getConversationMode, getGrokPersona } from './redis';
import { getGrokReply } from './chat/grok';
import { createGrokVoiceAgentClient } from './voice-agent/grokVoiceAgent';
import { playVoiceAgentAudio } from './voice-agent/playVoiceAgentAudio';
import type { VoiceConnection } from '@discordjs/voice';

setupProcessErrorHandlers(log);

log.info('Starting Pranjeet');
log.info(`Starting (pid=${process.pid}, node=${process.version})`);
log.info(`Config: port=${PORT}, hasToken=${hasToken}, hasOrchestrator=${hasOrchestrator}`);
log.info(
  `Worker registration config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);
log.info(
  `Grok chat: ${GROK_ENABLED ? 'enabled' : 'disabled'} (set GROK_API_KEY and LOG_LEVEL=debug for details)`
);
log.info(
  `Realtime Voice Agent: ${GROK_ENABLED && !!GROK_API_KEY ? 'available (use when conversation mode is on)' : 'disabled (set GROK_API_KEY or XAI_API_KEY)'}`
);
if (!REDIS_URL) {
  log.warn(
    'REDIS_URL not set on Pranjeet — conversation mode and voice state will not sync with Raincloud; set REDIS_URL to use realtime Voice Agent'
  );
} else {
  log.info('REDIS_URL set — conversation mode and voice state will sync with Raincloud');
}
console.log(`[PRANJEET] Worker registration target: ${getOrchestratorBaseUrl() || 'unset'}`);

if (!hasToken) {
  log.error('PRANJEET_TOKEN environment variable is required');
}
if (!hasOrchestrator) {
  log.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
}

const requestCache = new RequestCache();
const client = createWorkerDiscordClient();

const handlers = createRpcHandlers({ client, requestCache });
const router = createPranjeetRouter(handlers);
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
  onReady: async () => {
    await initTTS();

    initVoiceInteractionManager(client, {
      enabled: VOICE_INTERACTION_ENABLED,
      triggerWord: VOICE_TRIGGER_WORD,
      sttProvider: 'openai',
      ttsProvider: 'openai',
      sttApiKey: STT_API_KEY ?? undefined,
      ttsApiKey: TTS_API_KEY ?? undefined,
      voiceName: TTS_VOICE,
      getConversationMode,
      createVoiceAgentClient: (session) => {
        const connection = (session as { connection?: VoiceConnection }).connection;
        if (!connection) {
          log.warn('Voice Agent: no connection on session (ensure you are in a VC with the bot)');
          return null;
        }
        const baseUrl = getOrchestratorBaseUrl();
        const executeCommand = async (
          commandName: string,
          args: Record<string, unknown>
        ): Promise<string> => {
          if (!baseUrl || !WORKER_SECRET) {
            throw new Error(
              'Cannot execute command: Raincloud URL or Worker Secret not configured'
            );
          }
          const headers = {
            'Content-Type': 'application/json',
            'x-worker-secret': WORKER_SECRET,
          };
          const baseBody = {
            guildId: session.guildId,
            userId: session.userId,
            username: session.username,
          };

          try {
            // skip_and_play: skip first (so current track is removed even when paused), then play if query provided
            if (commandName === 'skip_and_play') {
              const skipRes = await fetch(`${baseUrl}/internal/skip`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...baseBody, count: 1 }),
              });
              if (!skipRes.ok) {
                const text = await skipRes.text();
                throw new Error(`Skip failed: ${text}`);
              }
              const query = typeof args['query'] === 'string' ? args['query'].trim() : '';
              if (query) {
                const playRes = await fetch(`${baseUrl}/internal/play`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ ...baseBody, source: query }),
                });
                if (!playRes.ok) {
                  const text = await playRes.text();
                  throw new Error(`Play failed: ${text}`);
                }
                const playResult = (await playRes.json()) as { message?: string };
                return playResult.message ?? 'Skipped and playing.';
              }
              return 'Skipped.';
            }

            // Map other function names to internal endpoints
            const commandMap: Record<string, string> = {
              play_music: 'play',
              skip_song: 'skip',
              pause_music: 'pause',
              resume_music: 'resume',
              stop_music: 'stop',
              set_volume: 'volume',
              clear_queue: 'clear',
            };
            const endpoint = commandMap[commandName];
            if (!endpoint) {
              throw new Error(`Unknown command: ${commandName}`);
            }
            const body: Record<string, unknown> = { ...baseBody };
            if (commandName === 'play_music' && args['query']) {
              body['source'] = args['query'];
            } else if (commandName === 'skip_song') {
              body['count'] = args['count'] ?? 1;
            } else if (commandName === 'set_volume') {
              body['volume'] = args['volume'];
            }
            const response = await fetch(`${baseUrl}/internal/${endpoint}`, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            });
            if (!response.ok) {
              const text = await response.text();
              throw new Error(`Command failed: ${text}`);
            }
            const result = (await response.json()) as { success?: boolean; message?: string };
            return result.message || 'Command executed successfully';
          } catch (error) {
            const err = error as Error;
            log.error(`Error executing ${commandName}: ${err.message}`);
            throw err;
          }
        };
        return createGrokVoiceAgentClient(session.guildId, session.userId, {
          onAudioDone: (pcm) => playVoiceAgentAudio(session.guildId, connection, pcm),
          executeCommand,
        });
      },
      ttsHandler: async (guildId: string, text: string, userId?: string) => {
        if (!userId) return;
        try {
          await speakInGuild(guildId, text);
        } catch (error) {
          log.warn(`Failed to speak TTS locally: ${(error as Error).message}`);
        }
      },
      commandHandler: async (
        session: VoiceInteractionSession,
        command: ParsedVoiceCommand
      ): Promise<VoiceCommandResult | null> => {
        const inConversationMode = await getConversationMode(session.guildId, session.userId);
        if (inConversationMode) {
          const personaId = await getGrokPersona(session.guildId, session.userId);
          const reply = await getGrokReply(
            session.guildId,
            session.userId,
            command.rawText,
            personaId ?? undefined
          );
          return { success: true, command, response: reply };
        }

        const baseUrl = getOrchestratorBaseUrl();
        if (!baseUrl || !WORKER_SECRET) {
          log.warn('Cannot route command: Raincloud URL or Worker Secret not configured');
          return null;
        }
        const musicCommands = ['play', 'skip', 'pause', 'resume', 'stop', 'volume', 'clear'];
        if (musicCommands.includes(command.type)) {
          try {
            const response = await fetch(`${baseUrl}/internal/${command.type}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-worker-secret': WORKER_SECRET,
              },
              body: JSON.stringify({
                guildId: session.guildId,
                userId: session.userId,
                username: session.username,
                source: command.query,
                count: command.parameter,
                volume: command.parameter,
              }),
            });
            if (!response.ok) {
              const text = await response.text();
              log.warn(`Failed to route ${command.type} command: ${response.status} ${text}`);
              return {
                success: false,
                command,
                response: `I couldn't execute that command. Raincloud said: ${text}`,
              };
            }
            const result = (await response.json()) as { success?: boolean; message?: string };
            return {
              success: result.success !== false,
              command,
              response: result.message || '',
            };
          } catch (error) {
            log.error(`Error routing ${command.type} command: ${(error as Error).message}`);
            return {
              success: false,
              command,
              response: 'I encountered an error trying to reach the music service.',
            };
          }
        }
        return null;
      },
    });

    startServer();

    await registerWithOrchestrator({
      botType: 'pranjeet',
      logger: log,
    });

    if (REDIS_URL) {
      await startTtsQueue({
        hasToken,
        isClientReady: () => client.isReady(),
        log,
      });
    }
  },
});

void loginDiscordClient(client, TOKEN, {
  logger: log,
  onDegraded: () => {
    startServer();
  },
});
