/**
 * Type definitions for button components
 */

import type { ButtonInteraction } from 'discord.js';

/**
 * Button action types
 */
export type ButtonAction =
  | 'pause'
  | 'resume'
  | 'skip'
  | 'stop'
  | 'queue'
  | 'volume_up'
  | 'volume_down'
  | 'prev_page'
  | 'next_page'
  | 'first_page'
  | 'last_page'
  | 'confirm'
  | 'cancel';

/**
 * Button context for passing additional data
 */
export interface ButtonContext {
  guildId: string;
  userId?: string;
  page?: number;
  totalPages?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Button handler result
 */
export interface ButtonHandlerResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Button handler function type
 */
export type ButtonHandler = (
  interaction: ButtonInteraction,
  context: ButtonContext
) => Promise<ButtonHandlerResult>;

/**
 * Pagination state
 */
export interface PaginationState {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
}

/**
 * Music player state for buttons
 */
export interface MusicPlayerState {
  isPaused: boolean;
  hasQueue: boolean;
  queueLength: number;
  canSkip: boolean;
  nowPlaying: string | null;
}

/**
 * Button metadata embedded in custom ID
 */
export interface ButtonMetadata {
  action: string;
  guildId?: string;
  userId?: string;
  page?: number;
  [key: string]: string | number | undefined;
}
