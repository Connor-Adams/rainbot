const express = require('express');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const { createLogger } = require('../../utils/logger');
const { verifyUserRole } = require('../utils/roleVerifier');
const clientStore = require('../client');

const log = createLogger('AUTH_ROUTES');
const router = express.Router();

const { loadConfig } = require('../../utils/config');

const getConfig = () => {
    const config = loadConfig();
    
    // Determine callback URL - prioritize Railway, then CALLBACK_URL, then default
    let callbackURL = config.callbackURL;
    if (config.railwayPublicDomain && !callbackURL) {
        callbackURL = `https://${config.railwayPublicDomain}/auth/discord/callback`;
    }
    if (!callbackURL) {
        callbackURL = 'http://localhost:3000/auth/discord/callback';
    }
    
    return {
        clientId: config.clientId,
        clientSecret: config.discordClientSecret,
        callbackURL: callbackURL,
        requiredRoleId: config.requiredRoleId,
    };
};

// Configure Discord OAuth Strategy using OAuth2
const cfg = getConfig();
passport.use('discord', new OAuth2Strategy({
    authorizationURL: 'https://discord.com/api/oauth2/authorize',
    tokenURL: 'https://discord.com/api/oauth2/token',
    clientID: cfg.clientId,
    clientSecret: cfg.clientSecret,
    callbackURL: cfg.callbackURL,
    scope: ['identify', 'guilds'],
}, async (accessToken, refreshToken, profile, done) => {
    try {
        log.debug('OAuth strategy callback started');
        
        const botClient = clientStore.getClient();

        if (!botClient || !botClient.isReady()) {
            log.error('Bot client not ready during OAuth verification');
            return done(new Error('Bot is not ready. Please ensure the bot is running and connected.'));
        }

        log.debug('Fetching user profile from Discord API');
        // Fetch user profile from Discord API
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            log.error(`Failed to fetch user profile: ${userResponse.status} ${errorText}`);
            throw new Error(`Failed to fetch user profile from Discord: ${userResponse.status}`);
        }

        const discordUser = await userResponse.json();
        log.debug(`Fetched user profile: ${discordUser.username} (${discordUser.id})`);

        // Verify user has required role
        const cfg = getConfig();
        
        if (!cfg.requiredRoleId) {
            log.error('REQUIRED_ROLE_ID not configured');
            return done(new Error('Server configuration error: REQUIRED_ROLE_ID not set'));
        }
        
        log.debug(`Verifying role ${cfg.requiredRoleId} for user ${discordUser.id}`);
        log.debug(`Bot is in ${botClient.guilds.cache.size} guild(s)`);
        
        const hasRole = await verifyUserRole(discordUser.id, cfg.requiredRoleId, botClient);

        if (!hasRole) {
            log.warn(`OAuth access denied for user ${discordUser.username} (${discordUser.id}) - missing required role ${cfg.requiredRoleId}`);
            log.debug(`User is in ${botClient.guilds.cache.size} bot guild(s), but doesn't have required role`);
            
            // Get list of guild names for debugging
            const guildNames = Array.from(botClient.guilds.cache.values()).map(g => g.name).join(', ');
            log.debug(`Bot guilds: ${guildNames}`);
            
            return done(null, false, { 
                message: 'You do not have the required role to access this dashboard',
                details: `Required role ID: ${cfg.requiredRoleId}. User must have this role in at least one server where the bot is present. Bot is in: ${guildNames || 'no servers'}`
            });
        }

        // Store user info in session
        const user = {
            id: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: discordUser.avatar,
        };

        log.info(`OAuth access granted for user ${discordUser.username} (${discordUser.id})`);
        return done(null, user);
    } catch (error) {
        log.error(`Error during OAuth verification: ${error.message}`, { stack: error.stack });
        return done(error);
    }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
    done(null, user);
});

// Helper to get base URL from request
function getBaseUrl(req) {
    const { loadConfig } = require('../../utils/config');
    const config = loadConfig();
    
    // Railway provides public domain
    if (config.railwayPublicDomain) {
        return `https://${config.railwayPublicDomain}`;
    }
    // Local development
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    return `${protocol}://${host}`;
}

// Initiate OAuth flow
router.get('/discord', passport.authenticate('discord'));

// OAuth callback
router.get('/discord/callback', 
    (req, res, next) => {
        log.info('OAuth callback received', { query: req.query, sessionId: req.sessionID });
        next();
    },
    passport.authenticate('discord', { 
        failureRedirect: '/auth/error',
        failureFlash: false 
    }),
    (req, res) => {
        if (!req.user) {
            log.error('OAuth callback: req.user is missing after authentication');
            return res.redirect('/auth/error');
        }

        try {
            // Set access flags in session
            req.session.hasAccess = true;
            req.session.lastVerified = Date.now();
            
            // Ensure user is serialized in session
            req.login(req.user, (loginErr) => {
                if (loginErr) {
                    log.error(`Error during req.login: ${loginErr.message}`);
                    return res.redirect('/auth/error');
                }
                
                // Set access flags in session
                req.session.hasAccess = true;
                req.session.lastVerified = Date.now();
                
                // Save session before redirect
                req.session.save((err) => {
                    if (err) {
                        log.error(`Error saving session: ${err.message}`);
                        return res.redirect('/auth/error');
                    }
                    
                    log.info(`User ${req.user.username} (${req.user.id}) logged in successfully`);
                    log.debug(`Session ID: ${req.sessionID}, Session data:`, {
                        userId: req.user.id,
                        hasAccess: req.session.hasAccess,
                        lastVerified: req.session.lastVerified,
                        authenticated: req.isAuthenticated()
                    });
                    
                    const baseUrl = getBaseUrl(req);
                    log.debug(`Redirecting to: ${baseUrl}/`);
                    res.redirect(`${baseUrl}/`);
                });
            });
        } catch (error) {
            log.error(`Error in OAuth callback handler: ${error.message}`);
            res.redirect('/auth/error');
        }
    }
);

// Logout
router.get('/logout', (req, res) => {
    const username = req.user?.username || 'Unknown';
    req.logout((err) => {
        if (err) {
            log.error(`Error during logout: ${err.message}`);
            return res.status(500).json({ error: 'Logout failed' });
        }
        req.session.destroy((err) => {
            if (err) {
                log.error(`Error destroying session: ${err.message}`);
            }
            log.info(`User ${username} logged out`);
            const baseUrl = getBaseUrl(req);
            res.redirect(`${baseUrl}/`);
        });
    });
});

// Get current user info
router.get('/me', (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        avatarUrl: req.user.avatar 
            ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(req.user.discriminator) % 5}.png`,
    });
});

// Check authentication status
router.get('/check', async (req, res) => {
    log.debug(`Auth check requested - Session ID: ${req.sessionID}, Authenticated: ${req.isAuthenticated ? req.isAuthenticated() : false}`);
    
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        log.debug('Auth check: Not authenticated');
        return res.status(401).json({ authenticated: false });
    }

    const user = req.user;
    if (!user) {
        log.warn('Auth check: req.user is null despite being authenticated');
        return res.status(401).json({ authenticated: false });
    }

    log.debug(`Auth check: User ${user.username} (${user.id}) is authenticated`);

    const botClient = clientStore.getClient();
    const cfg = getConfig();

    // Check if verification is cached and still valid
    const now = Date.now();
    const lastVerified = req.session.lastVerified || 0;
    const hasAccess = req.session.hasAccess;
    const VERIFICATION_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

    // If we have cached access and it's still valid, use it
    if (hasAccess && (now - lastVerified) < VERIFICATION_CACHE_TIME) {
        log.debug(`Auth check: Using cached verification (${Math.round((now - lastVerified) / 1000)}s old)`);
        return res.json({ 
            authenticated: true, 
            hasAccess: true,
            cached: true,
            user: {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar,
            }
        });
    }

    // Verify user still has access (cache expired or not set)
    try {
        log.debug(`Auth check: Verifying role (cache expired or not set)`);
        const hasRole = await verifyUserRole(user.id, cfg.requiredRoleId, botClient);
        
        if (!hasRole) {
            log.warn(`Auth check: User ${user.username} no longer has required role`);
            return res.status(403).json({ 
                authenticated: true, 
                hasAccess: false,
                error: 'You no longer have the required role' 
            });
        }

        // Update session cache
        req.session.hasAccess = true;
        req.session.lastVerified = now;
        req.session.save(); // Save updated cache

        log.debug(`Auth check: Access verified and cached`);

        res.json({ 
            authenticated: true, 
            hasAccess: true,
            cached: false,
            user: {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar,
            }
        });
    } catch (error) {
        log.error(`Error checking access: ${error.message}`);
        return res.status(500).json({ error: 'Error verifying access' });
    }
});

// Error page with detailed error info
router.get('/error', (req, res) => {
    const errorMessage = req.query.error || 'Unknown error occurred';
    const errorDetails = req.query.details || '';
    
    log.warn(`OAuth error page accessed: ${errorMessage}`, { 
        details: errorDetails,
        query: req.query,
        sessionId: req.sessionID 
    });
    
    res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Access Denied - Rainbot</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: #1a1a1a;
                    color: #fff;
                }
                .error-container {
                    text-align: center;
                    padding: 2rem;
                    max-width: 600px;
                }
                h1 { color: #ff4444; }
                .error-details {
                    background: #2a2a2a;
                    padding: 1rem;
                    border-radius: 8px;
                    margin: 1rem 0;
                    font-family: monospace;
                    font-size: 0.9rem;
                    color: #aaa;
                }
                a { color: #5865f2; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <h1>Access Denied</h1>
                <p>${errorMessage}</p>
                ${errorDetails ? `<div class="error-details">${errorDetails}</div>` : ''}
                <p>Possible reasons:</p>
                <ul style="text-align: left; display: inline-block;">
                    <li>You don't have the required role in any server where the bot is present</li>
                    <li>The bot is not in the server where you have the role</li>
                    <li>Role ID is incorrect</li>
                    <li>Bot is not ready/connected</li>
                </ul>
                <p><a href="/auth/discord">Try again</a> | <a href="/">Go to dashboard</a></p>
            </div>
        </body>
        </html>
    `);
});

// Debug endpoint to check auth status
router.get('/debug', (req, res) => {
    res.json({
        authenticated: req.isAuthenticated ? req.isAuthenticated() : false,
        user: req.user || null,
        session: {
            id: req.sessionID,
            hasAccess: req.session.hasAccess,
            lastVerified: req.session.lastVerified,
            cookie: req.session.cookie
        },
        headers: {
            host: req.get('host'),
            origin: req.get('origin'),
            referer: req.get('referer')
        }
    });
});

module.exports = router;

