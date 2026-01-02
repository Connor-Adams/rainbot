/**
 * Type definitions for select menu components
 */

import type {
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  MentionableSelectMenuInteraction,
} from 'discord.js';

/**
 * Union type for all select menu interactions
 */
export type AnySelectMenuInteraction =
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | ChannelSelectMenuInteraction
  | MentionableSelectMenuInteraction;

/**
 * Select menu types
 */
export type SelectMenuType = 'string' | 'user' | 'role' | 'channel' | 'mentionable';

/**
 * Select menu action types
 */
export type SelectMenuAction =
  | 'audio_filter'
  | 'settings'
  | 'repeat_mode'
  | 'playlist'
  | 'audio_quality'
  | 'dj_assign'
  | 'role_permission'
  | 'channel_config';

/**
 * Context passed to select menu handlers
 */
export interface SelectMenuContext {
  guildId: string;
  userId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result from a select menu handler
 */
export interface SelectMenuHandlerResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Select menu handler function type
 */
export type SelectMenuHandler = (
  interaction: AnySelectMenuInteraction,
  context: SelectMenuContext
) => Promise<SelectMenuHandlerResult>;

/**
 * Select menu metadata embedded in custom ID
 */
export interface SelectMenuMetadata {
  action: string;
  guildId?: string;
  userId?: string;
  [key: string]: string | number | undefined;
}

/**
 * Audio filter options
 */
export type AudioFilter = 'none' | 'bassboost' | 'nightcore' | 'vaporwave' | '8d';

/**
 * Repeat mode options
 */
export type RepeatMode = 'off' | 'track' | 'queue';

/**
 * Audio quality options
 */
export type AudioQuality = 'low' | 'medium' | 'high';

/**
 * Settings that can be configured via select menus
 */
export interface GuildSettings {
  defaultVolume?: number;
  repeatMode?: RepeatMode;
  audioQuality?: AudioQuality;
  autoLeaveTimeout?: number;
  djOnlyMode?: boolean;
  defaultChannel?: string;
  filters?: AudioFilter[];
}

/**
 * Select menu option with emoji support
 */
export interface SelectMenuOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
}
