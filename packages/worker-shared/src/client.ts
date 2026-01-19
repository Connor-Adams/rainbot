import { Client, GatewayIntentBits, Events } from 'discord.js';
import { createLogger } from '@rainbot/shared';
import { logErrorWithStack } from './errors';

/**
 * Create a Discord client with standard worker intents
 */
export function createWorkerDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
}

/**
 * Setup error handler for Discord client
 */
export function setupDiscordClientErrorHandler(
  client: Client,
  logger: ReturnType<typeof createLogger>
): void {
  client.on('error', (error) => {
    logErrorWithStack(logger, 'Client error', error);
  });
}

/**
 * Setup ready handler for Discord client
 */
export function setupDiscordClientReadyHandler(
  client: Client,
  options: {
    onReady?: () => void;
    orchestratorBotId?: string;
    logger?: ReturnType<typeof createLogger>;
  }
): void {
  const { onReady, orchestratorBotId, logger = createLogger('CLIENT') } = options;

  client.once(Events.ClientReady, () => {
    logger.info(`Ready as ${client.user?.tag}`);
    if (orchestratorBotId) {
      logger.info(`Auto-follow enabled for orchestrator: ${orchestratorBotId}`);
    }
    onReady?.();
  });
}

/**
 * Login Discord client with optional degraded mode handling
 */
export async function loginDiscordClient(
  client: Client,
  token: string | undefined,
  options?: {
    onDegraded?: () => void;
    logger?: ReturnType<typeof createLogger>;
  }
): Promise<void> {
  const { onDegraded, logger = createLogger('CLIENT') } = options || {};

  if (token) {
    await client.login(token);
  } else {
    logger.warn('Bot token missing; running in degraded mode (HTTP only)');
    onDegraded?.();
  }
}
