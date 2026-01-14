import type { Client, Guild, Interaction, VoiceState } from 'discord.js';

export type DiscordEventName =
  | 'ready'
  | 'interactionCreate'
  | 'guildCreate'
  | 'guildDelete'
  | 'voiceStateUpdate';

export interface DiscordEventPayloads {
  ready: Client;
  interactionCreate: Interaction;
  guildCreate: Guild;
  guildDelete: Guild;
  voiceStateUpdate: [VoiceState, VoiceState];
}
