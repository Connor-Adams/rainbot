const express = require('express');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const { createLogger } = require('../../utils/logger');
const { verifyUserRole } = require('../utils/roleVerifier');
const server = require('../index');

const log = createLogger('AUTH_ROUTES');
const router = express.Router();

// Get config
const config = require('../../config.json');

// Configure Discord OAuth Strategy using OAuth2
passport.use('discord', new OAuth2Strategy({
    authorizationURL: 'https://discord.com/api/oauth2/authorize',
    tokenURL: 'https://discord.com/api/oauth2/token',
    clientID: config.clientId,
    clientSecret: config.discordClientSecret,
    callbackURL: config.callbackURL,
    scope: ['identify', 'guilds'],
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const botClient = server.getClient();

        if (!botClient || !botClient.isReady()) {
            log.warn('Bot client not ready during OAuth verification');
            return done(new Error('Bot is not ready'));
        }

        // Fetch user profile from Discord API
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user profile from Discord');
        }

        const discordUser = await userResponse.json();

        // Verify user has required role
        const hasRole = await verifyUserRole(discordUser.id, config.requiredRoleId, botClient);

        if (!hasRole) {
            log.info(`OAuth access denied for user ${discordUser.username} (${discordUser.id}) - missing required role`);
            return done(null, false, { message: 'You do not have the required role to access this dashboard' });
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
        log.error(`Error during OAuth verification: ${error.message}`);
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

// Initiate OAuth flow
router.get('/discord', passport.authenticate('discord'));

// OAuth callback
router.get('/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/auth/error' }),
    (req, res) => {
        // Set access flags in session
        req.session.hasAccess = true;
        req.session.lastVerified = Date.now();
        
        log.info(`User ${req.user.username} logged in successfully`);
        res.redirect('http://localhost:3000/');
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
            res.redirect('http://localhost:3000/');
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
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ authenticated: false });
    }

    const user = req.user;
    const botClient = server.getClient();

    // Verify user still has access
    try {
        const hasRole = await verifyUserRole(user.id, config.requiredRoleId, botClient);
        
        if (!hasRole) {
            return res.status(403).json({ 
                authenticated: true, 
                hasAccess: false,
                error: 'You no longer have the required role' 
            });
        }

        // Update session cache
        req.session.hasAccess = true;
        req.session.lastVerified = Date.now();

        res.json({ 
            authenticated: true, 
            hasAccess: true,
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

// Error page
router.get('/error', (req, res) => {
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
                }
                h1 { color: #ff4444; }
                a { color: #5865f2; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <h1>Access Denied</h1>
                <p>You do not have the required role to access this dashboard.</p>
                <p><a href="/auth/discord">Try again</a></p>
            </div>
        </body>
        </html>
    `);
});

module.exports = router;

