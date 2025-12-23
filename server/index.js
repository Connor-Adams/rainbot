const express = require('express');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const { createLogger } = require('../utils/logger');
const requestLogger = require('./middleware/requestLogger');

const log = createLogger('SERVER');
const clientStore = require('./client');

// Try to load Redis (optional dependency)
let RedisStore;
let redis;
try {
  const redisLib = require('redis');
  RedisStore = require('connect-redis').default;
  redis = redisLib;
} catch {
  // Redis not available, will use file store
  log.debug('Redis not available, will use file store for sessions');
}

async function createServer() {
  const app = express();
  const { loadConfig } = require('../utils/config');
  const config = loadConfig();

  // Trust proxy - required for Railway/Heroku/etc. to handle HTTPS properly
  // This enables correct handling of X-Forwarded-* headers
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PUBLIC_DOMAIN;
  if (isRailway || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    log.debug('Trust proxy enabled for production/Railway environment');
  }

  // Request logging
  app.use(requestLogger);

  // Session configuration
  // Prefer Redis for persistent sessions across deployments
  // IMPORTANT: Session secret must be consistent across deployments for sessions to persist
  const sessionSecret = config.sessionSecret;
  if (!sessionSecret || sessionSecret === 'change-this-secret-in-production') {
    log.error('⚠️  WARNING: SESSION_SECRET not set or using default value!');
    log.error(
      '⚠️  Sessions will NOT persist across deployments without a consistent SESSION_SECRET.'
    );
    log.error('⚠️  Set SESSION_SECRET environment variable to a secure random string.');
    log.error('⚠️  Generate one with: openssl rand -hex 32');
  } else {
    log.info('✓ SESSION_SECRET is configured (sessions will persist if secret stays consistent)');
  }

  let sessionStore;
  // Try to get Redis URL from config or environment
  let redisUrl = config.redisUrl || process.env.REDIS_URL;

  // If REDIS_URL is not set, try to construct it from Railway's individual Redis env vars
  if (!redisUrl && process.env.REDISHOST) {
    const redisHost = process.env.REDISHOST;
    const redisPort = process.env.REDISPORT || '6379';
    const redisUser = process.env.REDISUSER || '';
    const redisPassword = process.env.REDISPASSWORD || '';

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
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              log.error('Redis connection failed after 10 retries, falling back to memory store');
              return false; // Stop retrying
            }
            return Math.min(retries * 100, 3000); // Exponential backoff, max 3s
          },
        },
      });

      redisClient.on('error', (err) => {
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
        log.warn(
          `Failed to connect to Redis: ${connectError.message}, falling back to memory store`
        );
        // Close the client if connection failed
        try {
          await redisClient.quit();
        } catch {
          // Ignore quit errors
        }
        sessionStore = null;
      }
    } catch (error) {
      log.warn(`Failed to initialize Redis store: ${error.message}, falling back to memory store`);
      sessionStore = null;
    }
  }

  // Fallback to memory store if Redis is not available
  // Note: Memory store does NOT persist across restarts, but is better than file store on Railway
  // For production, use Redis for persistent sessions
  if (!sessionStore) {
    if (isRailway || process.env.NODE_ENV === 'production') {
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
        log.warn(`Failed to create file store: ${error.message}, using memory store`);
        sessionStore = undefined;
      }
    }
  }

  // Determine cookie security based on environment
  const useSecureCookies = process.env.NODE_ENV === 'production' || isRailway;

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
        sameSite: 'lax', // Allows cookies to be sent on top-level navigations
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

  // Auth routes (must be before protected routes)
  const authRoutes = require('./routes/auth');
  app.use('/auth', authRoutes);

  // API routes (must be before static files)
  const apiRoutes = require('./routes/api');
  app.use('/api', apiRoutes);

  // Statistics routes
  const statsRoutes = require('./routes/stats');
  app.use('/api/stats', statsRoutes);

  // Serve React build from ui/dist (production)
  // This is the standard pattern: source code in ui/, build output in ui/dist/
  const reactBuildPath = path.join(__dirname, '..', 'ui', 'dist');
  const fs = require('fs');

  if (fs.existsSync(reactBuildPath)) {
    // Serve React build static assets
    app.use(express.static(reactBuildPath));
    log.info('Serving React UI from ui/dist');
  } else {
    log.warn('React build not found at ui/dist. Run "npm run build:ui" to build the UI.');
  }

  // Serve React app for all other routes (SPA fallback)
  // IMPORTANT: Don't require auth here - let React app handle auth client-side
  // The React app will check auth via /auth/check API endpoint
  app.use((req, res) => {
    // Skip if it's an API or auth route (shouldn't reach here, but safety check)
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    // Serve React app (SPA fallback) - no auth required, React handles it
    const reactIndex = path.join(reactBuildPath, 'index.html');
    if (fs.existsSync(reactIndex)) {
      res.sendFile(reactIndex);
    } else {
      res.status(503).send(`
                <html>
                    <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
                        <h1>UI Not Built</h1>
                        <p>React UI has not been built yet.</p>
                        <p>Run: <code>npm run build:ui</code></p>
                    </body>
                </html>
            `);
    }
  });

  return app;
}

async function start(client, port = 3000) {
  clientStore.setClient(client);
  const app = await createServer();
  const { loadConfig } = require('../utils/config');
  const config = loadConfig();

  // Railway and other platforms use 0.0.0.0 instead of localhost
  const host = process.env.HOST || '0.0.0.0';

  app.listen(port, host, () => {
    const url = config.railwayPublicDomain
      ? `https://${config.railwayPublicDomain}`
      : `http://${host}:${port}`;
    log.info(`Dashboard running at ${url}`);
  });

  return app;
}

function getClient() {
  return clientStore.getClient();
}

module.exports = {
  start,
  getClient,
  createServer,
};
