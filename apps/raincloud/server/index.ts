import express, { Application, Request, Response } from 'express';
import session from 'express-session';
import FileStoreFactory = require('session-file-store');
import passport from 'passport';
import { createLogger } from '@utils/logger';
import * as storage from '@utils/storage';
import requestLogger from './middleware/requestLogger';
import { unauthRateLimiter } from './middleware/unauthRateLimit';
import { setClient, getClient } from './client';
import type { AppConfig } from '@rainbot/types/server';

const log = createLogger('SERVER');
const FileStore = FileStoreFactory(session);

// Try to load Redis (optional dependency)
let RedisStore: typeof import('connect-redis').default | undefined;
let redis: typeof import('redis') | undefined;
try {
  const redisLib = require('redis');
  RedisStore = require('connect-redis').default;
  redis = redisLib;
} catch {
  // Redis not available, will use file store
  log.debug('Redis not available, will use file store for sessions');
}

export async function createServer(): Promise<Application> {
  const app = express();
  const { loadConfig } = require('@utils/config');
  const config: AppConfig = loadConfig();
  // In dev, allow Vite UI origin by default so login works without setting DASHBOARD_ORIGIN
  const dashboardOrigin =
    process.env['DASHBOARD_ORIGIN'] ||
    process.env['UI_ORIGIN'] ||
    (process.env['NODE_ENV'] !== 'production' ? 'http://localhost:5173' : undefined);
  const enableCors = !!dashboardOrigin;

  // Trust proxy - required for Railway/Heroku/etc. to handle HTTPS properly
  // This enables correct handling of X-Forwarded-* headers
  const isRailway = !!process.env['RAILWAY_ENVIRONMENT'] || !!process.env['RAILWAY_PUBLIC_DOMAIN'];
  if (isRailway || process.env['NODE_ENV'] === 'production') {
    app.set('trust proxy', 1);
    log.debug('Trust proxy enabled for production/Railway environment');
  }

  // Request logging
  app.use(requestLogger);
  // Rate limit unauthenticated requests across all routers
  app.use(unauthRateLimiter);

  if (enableCors) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && origin === dashboardOrigin) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.header(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With, X-XSRF-TOKEN'
        );
      }

      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }

      return next();
    });
  }

  if (process.env['SOUND_TRANSCODE_SWEEP'] === 'true') {
    const deleteOriginal = process.env['SOUND_TRANSCODE_DELETE_ORIGINAL'] === 'true';
    const limit = Number(process.env['SOUND_TRANSCODE_SWEEP_LIMIT'] || 0);
    void storage
      .sweepTranscodeSounds({ deleteOriginal, limit: Number.isFinite(limit) ? limit : 0 })
      .then((result: { converted: number; deleted: number; skipped: number }) => {
        log.info(
          `Sound transcode sweep complete: converted=${result.converted}, deleted=${result.deleted}, skipped=${result.skipped}`
        );
      })
      .catch((error: Error) => {
        log.warn(`Sound transcode sweep failed: ${error.message}`);
      });
  }

  // Session configuration
  // Prefer Redis for persistent sessions across deployments
  // IMPORTANT: Session secret must be consistent across deployments for sessions to persist
  const sessionSecret = config.sessionSecret;
  const isProd = process.env['NODE_ENV'] === 'production';
  const hasInvalidSecret = !sessionSecret || sessionSecret === 'change-this-secret-in-production';
  if (hasInvalidSecret) {
    log.error('WARNING: SESSION_SECRET not set or using default value!');
    log.error('Sessions will NOT persist across deployments without a consistent SESSION_SECRET.');
    log.error('Set SESSION_SECRET environment variable to a secure random string.');
    log.error('Generate one with: openssl rand -hex 32');
    if (isRailway || isProd) {
      throw new Error('SESSION_SECRET must be set in production/Railway environments.');
    }
  } else {
    log.info('SESSION_SECRET is configured (sessions will persist if secret stays consistent)');
  }

  let sessionStore: session.Store | undefined;
  // Try to get Redis URL from config or environment
  let redisUrl = config.redisUrl || process.env['REDIS_URL'];

  // If REDIS_URL is not set, try to construct it from Railway's individual Redis env vars
  if (!redisUrl && process.env['REDISHOST']) {
    const redisHost = process.env['REDISHOST'];
    const redisPort = process.env['REDISPORT'] || '6379';
    const redisUser = process.env['REDISUSER'] || '';
    const redisPassword = process.env['REDISPASSWORD'] || '';

    // Construct Redis URL: redis://[username]:[password]@host:port
    if (redisPassword) {
      if (redisUser) {
        redisUrl = `redis://${redisUser}:${redisPassword}@${redisHost}:${redisPort}`;
      } else {
        redisUrl = `redis://:${redisPassword}@${redisHost}:${redisPort}`;
      }
    } else {
      redisUrl = `redis://${redisHost}:${redisPort}`;
    }

    log.info(
      '✓ Constructed Redis URL from Railway environment variables (REDISHOST, REDISPORT, etc.)'
    );
  }

  // Check if Redis is available
  if (!RedisStore || !redis) {
    log.warn('⚠️  Redis libraries not available - install redis package for persistent sessions');
  } else if (!redisUrl) {
    log.warn(
      '⚠️  Redis URL not configured - set REDIS_URL or Railway will auto-set it when Redis service is added'
    );
  }

  if (redisUrl && RedisStore && redis) {
    try {
      // Mask password in logs for security
      const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':****@');
      log.debug(`Connecting to Redis: ${maskedUrl}`);

      // Create Redis client using URL (works for both Railway REDIS_URL and constructed URLs)
      const redisClient = redis.createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              log.error('Redis connection failed after 10 retries, falling back to memory store');
              return false; // Stop retrying
            }
            return Math.min(retries * 100, 3000); // Exponential backoff, max 3s
          },
        },
      });

      redisClient.on('error', (err: Error) => {
        log.error(`Redis client error: ${err.message}`);
      });

      redisClient.on('connect', () => {
        log.info('Redis client connected');
      });

      redisClient.on('ready', () => {
        log.info('Redis client ready');
      });

      // Connect Redis client and wait for connection before creating store
      // connect-redis v7 requires the client to be connected before passing it to RedisStore
      try {
        await redisClient.connect();

        // Create Redis session store after connection is established
        sessionStore = new RedisStore({
          client: redisClient,
          prefix: 'rainbot:sess:',
          ttl: 7 * 24 * 60 * 60, // 7 days
        });

        log.info('✓ Using Redis for session storage (sessions will persist across deployments)');
      } catch (connectError) {
        const err = connectError as Error;
        log.warn(`Failed to connect to Redis: ${err.message}, falling back to memory store`);
        // Close the client if connection failed
        try {
          await redisClient.quit();
        } catch {
          // Ignore quit errors
        }
        sessionStore = undefined;
      }
    } catch (error) {
      const err = error as Error;
      log.warn(`Failed to initialize Redis store: ${err.message}, falling back to memory store`);
      sessionStore = undefined;
    }
  }

  // Fallback to memory store if Redis is not available
  // Note: Memory store does NOT persist across restarts, but is better than file store on Railway
  // For production, use Redis for persistent sessions
  if (!sessionStore) {
    if (isRailway || process.env['NODE_ENV'] === 'production') {
      log.warn('⚠️  Using memory store for sessions (sessions will NOT persist across restarts)');
      log.warn('⚠️  For persistent sessions, configure REDIS_URL environment variable');
      // Use default memory store (no store specified)
      sessionStore = undefined;
    } else {
      // Local development: use file store
      try {
        sessionStore = new FileStore({
          path: config.sessionStorePath,
          ttl: 7 * 24 * 60 * 60, // 7 days
        });
        log.info(`✓ Using file store for sessions at ${config.sessionStorePath}`);
      } catch (error) {
        const err = error as Error;
        log.warn(`Failed to create file store: ${err.message}, using memory store`);
        sessionStore = undefined;
      }
    }
  }

  // Determine cookie security based on environment
  const useSecureCookies = process.env['NODE_ENV'] === 'production' || isRailway || enableCors;
  const sameSitePolicy: 'lax' | 'none' = enableCors ? 'none' : 'lax';

  app.use(
    session({
      store: sessionStore,
      secret: sessionSecret || 'change-this-secret-in-production',
      resave: false,
      saveUninitialized: false,
      name: 'rainbot.sid', // Custom session name
      cookie: {
        httpOnly: true,
        secure: useSecureCookies, // Secure cookies on Railway/production
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: sameSitePolicy, // Cross-origin UI needs SameSite=None
        // Don't set domain - let browser handle it (works better across subdomains)
      },
      rolling: true, // Reset expiration on activity (extends session on each request)
    })
  );

  const storeType = sessionStore ? sessionStore.constructor.name : 'MemoryStore';
  log.info(
    `Session configured: store=${storeType}, secure=${useSecureCookies}, Railway=${isRailway}`
  );

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health checks (no auth)
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  app.get('/health/ready', (_req: Request, res: Response) => {
    const client = getClient();
    const ready = !!config.token && !!client && client.isReady();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      service: 'raincloud',
      ready,
      degraded: !config.token,
      timestamp: Date.now(),
    });
  });

  // Internal routes (worker registration)
  const internalRoutes = require('./routes/internal').default;
  app.use('/internal', internalRoutes);

  // Auth routes (must be before protected routes)
  const authRoutes = require('./routes/auth').default;
  app.use('/auth', authRoutes);

  // API routes (must be before static files)
  const apiRoutes = require('./routes/api').default;
  app.use('/api', apiRoutes);

  // Statistics routes
  const statsRoutes = require('./routes/stats').default;
  app.use('/api/stats', statsRoutes);

  // API-only: no UI serving; unmatched routes 404
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

export { getClient, setClient };
