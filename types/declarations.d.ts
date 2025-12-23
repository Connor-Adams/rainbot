/**
 * Type declarations for modules without types
 */

declare module 'session-file-store' {
  import session from 'express-session';

  interface FileStoreOptions {
    path?: string;
    ttl?: number;
    retries?: number;
    factor?: number;
    minTimeout?: number;
    maxTimeout?: number;
    reapInterval?: number;
    reapMaxAge?: number;
    reapAsync?: boolean;
    reapSyncFallback?: boolean;
    logFn?: (...args: unknown[]) => void;
    fallbackSessionFn?: () => session.SessionData;
    secret?: string;
    encoder?: (sessionData: session.SessionData) => string;
    decoder?: (sessionString: string) => session.SessionData;
    encryptEncoding?: string;
    encoding?: string;
    fileExtension?: string;
    keyFunction?: (secret: string, sessionId: string) => string;
  }

  function FileStoreFactory(session: typeof import('express-session')): {
    new (options?: FileStoreOptions): session.Store;
  };

  export = FileStoreFactory;
}

// Declare JS utility modules as 'any' for now
declare module '*/utils/logger' {
  export function createLogger(name: string): {
    debug: (message: string, meta?: object) => void;
    info: (message: string, meta?: object) => void;
    warn: (message: string, meta?: object) => void;
    error: (message: string, meta?: object) => void;
    http: (message: string, meta?: object) => void;
  };
}

declare module '*/utils/voiceManager' {
  const voiceManager: {
    listSounds(): Promise<Array<{ name: string; size: number }>>;
    deleteSound(name: string): Promise<void>;
    playSound(
      guildId: string,
      source: string,
      userId: string | null,
      sourceType: string,
      username: string | null,
      discriminator: string | null
    ): Promise<{
      tracks: Array<{ title: string; url?: string; duration?: number; isLocal?: boolean }>;
      added: number;
      totalInQueue: number;
    }>;
    playSoundboardOverlay(
      guildId: string,
      sound: string,
      userId: string | null,
      sourceType: string,
      username: string | null,
      discriminator: string | null
    ): Promise<{ message: string }>;
    stopSound(guildId: string): boolean;
    skip(guildId: string): Array<{ title: string }> | null;
    togglePause(guildId: string): boolean;
    setVolume(guildId: string, level: number): number;
    getAllConnections(): Array<{
      guildId: string;
      channelId: string;
      channelName: string;
      nowPlaying?: string;
    }>;
    getQueue(guildId: string): {
      nowPlaying: string | null;
      queue: Array<{ title: string; url?: string; duration?: number }>;
      totalInQueue: number;
      isPaused?: boolean;
    };
    clearQueue(guildId: string): number;
    removeTrackFromQueue(guildId: string, index: number): { title: string };
  };
  export = voiceManager;
}

declare module '*/utils/storage' {
  import { Readable } from 'stream';

  const storage: {
    getSoundStream(filename: string): Promise<Readable>;
    uploadSound(stream: Readable, filename: string): Promise<string>;
  };
  export = storage;
}

declare module '*/utils/statistics' {
  const stats: {
    trackCommand(
      command: string,
      userId: string,
      guildId: string,
      source: string,
      success: boolean,
      error: string | null,
      username: string | null,
      discriminator: string | null
    ): void;
    trackQueueOperation(
      operation: string,
      userId: string,
      guildId: string,
      source: string,
      metadata: object
    ): void;
  };
  export = stats;
}

declare module '*/utils/config' {
  export function loadConfig(): {
    token: string;
    clientId: string;
    discordClientSecret: string;
    callbackURL?: string;
    requiredRoleId: string;
    sessionSecret: string;
    sessionStorePath: string;
    railwayPublicDomain?: string;
    databaseUrl?: string;
    redisUrl?: string;
  };
}

declare module '*/utils/database' {
  export function query(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: Record<string, unknown>[] } | null>;
  export function initDatabase(): unknown;
  export function initializeSchema(): Promise<boolean>;
  export function close(): Promise<void>;
}

declare module '*/utils/listeningHistory' {
  export function getListeningHistory(
    userId: string | null,
    guildId: string | null,
    limit: number,
    startDate: Date | null,
    endDate: Date | null
  ): Promise<Array<Record<string, unknown>>>;
}

// Augment Express types
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
    }
  }
}

export {};
