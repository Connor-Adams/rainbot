import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { createLogger } from '@utils/logger';
import { verifyUserRole } from '../utils/roleVerifier';
import { getClient } from '../client';
import type { DiscordUser, AuthenticatedRequest, AppConfig } from '@rainbot/types/server';

const log = createLogger('AUTH_ROUTES');
const router = express.Router();

const { loadConfig } = require('@utils/config');

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackURL: string;
  requiredRoleId: string;
}

const getConfig = (): OAuthConfig => {
  const config: AppConfig = loadConfig();

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

const cfg = getConfig();
const oauthConfigured = !!cfg.clientId && !!cfg.clientSecret;

if (oauthConfigured) {
  // Configure Discord OAuth Strategy using OAuth2
  passport.use(
    'discord',
    new OAuth2Strategy(
      {
        authorizationURL: 'https://discord.com/api/oauth2/authorize',
        tokenURL: 'https://discord.com/api/oauth2/token',
        clientID: cfg.clientId,
        clientSecret: cfg.clientSecret,
        callbackURL: cfg.callbackURL,
        scope: ['identify', 'guilds'],
      },
      async (
        accessToken: string,
        _refreshToken: string,
        _profile: unknown,
        done: (
          error: Error | null,
          user?: DiscordUser | false,
          info?: { message: string; details?: string }
        ) => void
      ) => {
        try {
          log.debug('OAuth strategy callback started');

          const botClient = getClient();

          if (!botClient || !botClient.isReady()) {
            log.error('Bot client not ready during OAuth verification');
            return done(
              new Error('Bot is not ready. Please ensure the bot is running and connected.')
            );
          }

          log.debug('Fetching user profile from Discord API');
          // Fetch user profile from Discord API
          const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!userResponse.ok) {
            const errorText = await userResponse.text();
            log.error(`Failed to fetch user profile: ${userResponse.status} ${errorText}`);
            throw new Error(`Failed to fetch user profile from Discord: ${userResponse.status}`);
          }

          interface DiscordApiUser {
            id: string;
            username: string;
            discriminator: string;
            avatar: string | null;
          }
          const discordUser = (await userResponse.json()) as DiscordApiUser;
          log.debug(`Fetched user profile: ${discordUser.username} (${discordUser.id})`);

          // Verify user has required role
          const currentCfg = getConfig();

          // If no required role is configured, allow all authenticated Discord users
          if (!currentCfg.requiredRoleId) {
            log.debug('No requiredRoleId configured - allowing all authenticated users');
            const user: DiscordUser = {
              id: discordUser.id,
              username: discordUser.username,
              discriminator: discordUser.discriminator,
              avatar: discordUser.avatar,
            };
            log.info(`OAuth access granted for user ${discordUser.username} (${discordUser.id})`);
            return done(null, user);
          }

          log.debug(`Verifying role ${currentCfg.requiredRoleId} for user ${discordUser.id}`);
          log.debug(`Bot is in ${botClient.guilds.cache.size} guild(s)`);

          const hasRole = await verifyUserRole(
            discordUser.id,
            currentCfg.requiredRoleId,
            botClient
          );

          if (!hasRole) {
            log.warn(
              `OAuth access denied for user ${discordUser.username} (${discordUser.id}) - missing required role ${currentCfg.requiredRoleId}`
            );
            log.debug(
              `User is in ${botClient.guilds.cache.size} bot guild(s), but doesn't have required role`
            );

            // Get list of guild names for debugging
            const guildNames = Array.from(botClient.guilds.cache.values())
              .map((g) => g.name)
              .join(', ');
            log.debug(`Bot guilds: ${guildNames}`);

            return done(null, false, {
              message: 'You do not have the required role to access this dashboard',
              details: `Required role ID: ${currentCfg.requiredRoleId}. User must have this role in at least one server where the bot is present. Bot is in: ${guildNames || 'no servers'}`,
            });
          }

          // Store user info in session
          const user: DiscordUser = {
            id: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            avatar: discordUser.avatar,
          };

          log.info(`OAuth access granted for user ${discordUser.username} (${discordUser.id})`);
          return done(null, user);
        } catch (error) {
          const err = error as Error;
          log.error(`Error during OAuth verification: ${err.message}`, { stack: err.stack });
          return done(err);
        }
      }
    )
  );
} else {
  log.warn('Discord OAuth is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.');
}

// Serialize user for session
passport.serializeUser((user: Express.User, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user: Express.User, done) => {
  done(null, user);
});

// Helper to get base URL from request
function getBaseUrl(req: Request): string {
  const config: AppConfig = loadConfig();
  const dashboardOrigin = process.env['DASHBOARD_ORIGIN'] || process.env['UI_ORIGIN'];

  if (dashboardOrigin) {
    return dashboardOrigin.replace(/\/$/, '');
  }

  // Railway provides public domain
  if (config.railwayPublicDomain) {
    return `https://${config.railwayPublicDomain}`;
  }
  // Local development
  if (process.env['NODE_ENV'] !== 'production') {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    return `${protocol}://${host}`;
  }

  // Production fallback avoids host-header injection
  return 'http://localhost:3000';
}

// Initiate OAuth flow
router.get('/discord', (req: Request, res: Response, next: NextFunction) => {
  if (!oauthConfigured) {
    res.status(503).json({ error: 'OAuth not configured' });
    return;
  }
  const session = req.session as { oauthState?: string };
  session.oauthState = crypto.randomBytes(16).toString('hex');
  return passport.authenticate('discord', { state: session.oauthState })(req, res, next);
});

// OAuth callback
router.get(
  '/discord/callback',
  (req: Request, res: Response, next: NextFunction) => {
    if (!oauthConfigured) {
      res.status(503).json({ error: 'OAuth not configured' });
      return;
    }
    const session = req.session as { oauthState?: string };
    const state = req.query['state'];
    if (!session?.oauthState || typeof state !== 'string' || state !== session.oauthState) {
      log.warn('OAuth callback state mismatch', {
        hasSessionState: !!session?.oauthState,
        receivedState: typeof state === 'string' ? state : undefined,
      });
      if (session) {
        delete session.oauthState;
      }
      const errorParam = encodeURIComponent('Invalid OAuth state');
      res.redirect(`/auth/error?error=${errorParam}`);
      return;
    }
    delete session.oauthState;
    log.info('OAuth callback received', { query: req.query, sessionId: req.sessionID });
    next();
  },
  passport.authenticate('discord', {
    failureRedirect: '/auth/error',
    failureFlash: false,
  }),
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      log.error('OAuth callback: req.user is missing after authentication');
      return res.redirect('/auth/error');
    }

    try {
      // Set access flags in session
      req.session.hasAccess = true;
      req.session.lastVerified = Date.now();

      // Ensure user is serialized in session
      req.login(req.user, (loginErr: Error | null) => {
        if (loginErr) {
          log.error(`Error during req.login: ${loginErr.message}`);
          return res.redirect('/auth/error');
        }

        // Set access flags in session
        req.session.hasAccess = true;
        req.session.lastVerified = Date.now();

        // Save session before redirect
        req.session.save((err: Error | null) => {
          if (err) {
            log.error(`Error saving session: ${err.message}`);
            return res.redirect('/auth/error');
          }

          const user = req.user as DiscordUser;
          log.info(`User ${user.username} (${user.id}) logged in successfully`);
          log.debug(`Session ID: ${req.sessionID}, Session data:`, {
            userId: user.id,
            hasAccess: req.session.hasAccess,
            lastVerified: req.session.lastVerified,
            authenticated: req.isAuthenticated(),
          });

          const baseUrl = getBaseUrl(req);
          log.debug(`Redirecting to: ${baseUrl}/`);
          res.redirect(`${baseUrl}/`);
        });
      });
    } catch (error) {
      const err = error as Error;
      log.error(`Error in OAuth callback handler: ${err.message}`);
      res.redirect('/auth/error');
    }
  }
);

// Logout
router.get('/logout', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user as DiscordUser | undefined;
  const username = user?.username || 'Unknown';
  req.logout((err: Error | null) => {
    if (err) {
      log.error(`Error during logout: ${err.message}`);
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    req.session.destroy((destroyErr: Error | null) => {
      if (destroyErr) {
        log.error(`Error destroying session: ${destroyErr.message}`);
      }
      log.info(`User ${username} logged out`);
      const baseUrl = getBaseUrl(req);
      res.redirect(`${baseUrl}/`);
    });
  });
});

// Get current user info
router.get('/me', (req: AuthenticatedRequest, res: Response): void => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = req.user as DiscordUser;
  const discriminatorNumber = Number(user.discriminator);
  const avatarFallbackIndex = Number.isFinite(discriminatorNumber) ? discriminatorNumber % 5 : 0;
  res.json({
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    avatar: user.avatar,
    avatarUrl: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${avatarFallbackIndex}.png`,
  });
});

// Check authentication status
router.get('/check', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  log.debug(
    `Auth check requested - Session ID: ${req.sessionID}, Authenticated: ${req.isAuthenticated ? req.isAuthenticated() : false}`
  );

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    log.debug('Auth check: Not authenticated');
    res.status(401).json({ authenticated: false });
    return;
  }

  const user = req.user as DiscordUser | undefined;
  if (!user) {
    log.warn('Auth check: req.user is null despite being authenticated');
    res.status(401).json({ authenticated: false });
    return;
  }

  log.debug(`Auth check: User ${user.username} (${user.id}) is authenticated`);

  const botClient = getClient();
  const currentCfg = getConfig();

  // Check if verification is cached and still valid
  const now = Date.now();
  const lastVerified = req.session?.lastVerified || 0;
  const hasAccess = req.session?.hasAccess;
  const VERIFICATION_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

  // If we have cached access and it's still valid, use it
  if (hasAccess && now - lastVerified < VERIFICATION_CACHE_TIME) {
    log.debug(
      `Auth check: Using cached verification (${Math.round((now - lastVerified) / 1000)}s old)`
    );
    res.json({
      authenticated: true,
      hasAccess: true,
      cached: true,
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
      },
    });
    return;
  }

  // Verify user still has access (cache expired or not set)
  try {
    log.debug(`Auth check: Verifying role (cache expired or not set)`);

    // If no required role is configured, grant access to all authenticated users
    let hasRole = true;
    if (currentCfg.requiredRoleId) {
      hasRole = await verifyUserRole(user.id, currentCfg.requiredRoleId, botClient);
    } else {
      log.debug(`Auth check: No requiredRoleId configured - allowing all authenticated users`);
    }

    if (!hasRole) {
      log.warn(`Auth check: User ${user.username} no longer has required role`);
      res.status(403).json({
        authenticated: true,
        hasAccess: false,
        error: 'You no longer have the required role',
      });
      return;
    }

    // Update session cache
    if (req.session) {
      req.session.hasAccess = true;
      req.session.lastVerified = now;
      req.session.save(); // Save updated cache
    }

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
      },
    });
  } catch (error) {
    const err = error as Error;
    log.error(`Error checking access: ${err.message}`);
    res.status(500).json({ error: 'Error verifying access' });
  }
});

// Error page with detailed error info
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

router.get('/error', (req: Request, res: Response): void => {
  const errorMessageRaw = (req.query['error'] as string) || 'Unknown error occurred';
  const errorDetailsRaw = (req.query['details'] as string) || '';
  const errorMessage = escapeHtml(errorMessageRaw);
  const errorDetails = escapeHtml(errorDetailsRaw);

  log.warn(`OAuth error page accessed: ${errorMessage}`, {
    details: errorDetails,
    query: req.query,
    sessionId: req.sessionID,
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
router.get('/debug', (req: AuthenticatedRequest, res: Response) => {
  if (process.env['NODE_ENV'] === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json({
    authenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    user: req.user || null,
    session: {
      id: req.sessionID,
      hasAccess: req.session?.hasAccess,
      lastVerified: req.session?.lastVerified,
      cookie: req.session?.cookie,
    },
    headers: {
      host: req.get('host'),
      origin: req.get('origin'),
      referer: req.get('referer'),
    },
  });
});

export default router;
