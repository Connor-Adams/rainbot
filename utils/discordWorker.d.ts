import { Client, ClientOptions } from 'discord.js';
export interface DiscordWorkerOptions {
  token: string;
  orchestratorBotId?: string;
  onReady?: (client: Client) => void;
  onError?: (err: Error) => void;
  autoFollowOrchestrator?: boolean;
  getGuildState?: (guildId: string) => any;
  joinVoiceChannel?: (guildId: string, channelId: string) => void;
  clientOptions?: ClientOptions;
}
/**
 * Bootstraps a Discord.js client for a worker bot, with error handling and optional orchestrator auto-follow.
 * Usage: import { createDiscordWorker } from 'utils/discordWorker';
 */
export declare function createDiscordWorker({
  token,
  orchestratorBotId,
  onReady,
  onError,
  autoFollowOrchestrator,
  getGuildState,
  joinVoiceChannel,
  clientOptions,
}: DiscordWorkerOptions): Client<boolean>;
//# sourceMappingURL=discordWorker.d.ts.map
