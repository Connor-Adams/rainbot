/**
 * Core canonical types shared across the monorepo.
 */

export type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';

export interface Logger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  http: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}
