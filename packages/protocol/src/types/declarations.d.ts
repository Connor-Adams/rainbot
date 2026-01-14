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

  type FileStoreConstructor = new (options?: FileStoreOptions) => session.Store;

  const FileStoreFactory: (session: typeof import('express-session')) => FileStoreConstructor;

  export = FileStoreFactory;
}

// Augment Express types - in a separate ambient declaration file
declare namespace Express {
  interface User {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
  }
}
