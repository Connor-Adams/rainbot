const express = require('express');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const { createLogger } = require('../utils/logger');
const requestLogger = require('./middleware/requestLogger');
const { requireAuth } = require('./middleware/auth');

const log = createLogger('SERVER');
const clientStore = require('./client');

// Try to load Redis (optional dependency)
let RedisStore;
let redis;
try {
    const redisLib = require('redis');
    RedisStore = require('connect-redis').default;
    redis = redisLib;
} catch (e) {
    // Redis not available, will use file store
    log.debug('Redis not available, will use file store for sessions');
}

function createServer() {
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
    // Prefer Redis for persistent sessions across deployments, fallback to file store
    let sessionStore;
    const redisUrl = config.redisUrl || process.env.REDIS_URL;
    
    if (redisUrl && RedisStore && redis) {
        try {
            // Create Redis client
            const redisClient = redis.createClient({
                url: redisUrl,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            log.error('Redis connection failed after 10 retries, falling back to file store');
                            return false; // Stop retrying
                        }
                        return Math.min(retries * 100, 3000); // Exponential backoff, max 3s
                    }
                }
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

            // Connect Redis client (non-blocking)
            redisClient.connect().catch((err) => {
                log.warn(`Failed to connect to Redis: ${err.message}, falling back to file store`);
            });

            // Create Redis session store
            sessionStore = new RedisStore({
                client: redisClient,
                prefix: 'rainbot:sess:',
                ttl: 7 * 24 * 60 * 60, // 7 days
            });

            log.info('Using Redis for session storage (sessions will persist across deployments)');
        } catch (error) {
            log.warn(`Failed to initialize Redis store: ${error.message}, falling back to file store`);
            sessionStore = null;
        }
    }

    // Fallback to file store if Redis is not available
    if (!sessionStore) {
        sessionStore = new FileStore({
            path: config.sessionStorePath,
            ttl: 7 * 24 * 60 * 60, // 7 days
        });
        log.info(`Using file store for sessions at ${config.sessionStorePath} (sessions may not persist across deployments)`);
    }

    // Determine cookie security based on environment
    const useSecureCookies = process.env.NODE_ENV === 'production' || isRailway;
    
    app.use(session({
        store: sessionStore,
        secret: config.sessionSecret || 'change-this-secret-in-production',
        resave: false,
        saveUninitialized: false,
        name: 'rainbot.sid', // Custom session name
        cookie: {
            httpOnly: true,
            secure: useSecureCookies, // Secure cookies on Railway/production
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: 'lax',
            // Don't set domain - let browser handle it
        },
    }));
    
    log.debug(`Session configured: store=${sessionStore.constructor.name}, secure=${useSecureCookies}, Railway=${isRailway}`);

    // Initialize Passport
    app.use(passport.initialize());
    app.use(passport.session());

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Auth routes (must be before protected routes)
    const authRoutes = require('./routes/auth');
    app.use('/auth', authRoutes);

    // Serve static files from public directory
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // API routes
    const apiRoutes = require('./routes/api');
    app.use('/api', apiRoutes);

    // Serve dashboard for all other routes (protected)
    // This must be last to catch all unmatched routes
    app.use(requireAuth, (req, res) => {
        // Skip if it's an API or auth route (shouldn't reach here, but safety check)
        if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    return app;
}

function start(client, port = 3000) {
    clientStore.setClient(client);
    const app = createServer();
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
