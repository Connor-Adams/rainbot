const express = require('express');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const { createLogger } = require('../utils/logger');
const requestLogger = require('./middleware/requestLogger');
const { requireAuth } = require('./middleware/auth');

const log = createLogger('SERVER');

let discordClient = null;

function createServer() {
    const app = express();
    
    // Use environment variables, fallback to config.json for local development
    let config;
    try {
        config = require('../config.json');
    } catch (e) {
        config = {};
    }

    // Request logging
    app.use(requestLogger);

    // Session configuration
    // Use file store for persistent sessions (works on Railway and locally)
    const sessionStore = new FileStore({
        path: (config.sessionStorePath || process.env.SESSION_STORE_PATH || './sessions'),
        ttl: 7 * 24 * 60 * 60, // 7 days
    });

    app.use(session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || config.sessionSecret || 'change-this-secret-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Secure cookies in production
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: 'lax',
        },
    }));

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
    discordClient = client;
    const app = createServer();

    // Railway and other platforms use 0.0.0.0 instead of localhost
    const host = process.env.HOST || '0.0.0.0';
    
    app.listen(port, host, () => {
        const url = process.env.RAILWAY_PUBLIC_DOMAIN 
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : `http://${host}:${port}`;
        log.info(`Dashboard running at ${url}`);
    });

    return app;
}

function getClient() {
    return discordClient;
}

module.exports = {
    start,
    getClient,
    createServer,
};
