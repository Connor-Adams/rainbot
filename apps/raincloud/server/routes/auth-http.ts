import { createLogger } from '../../utils/logger.ts';
import { loadConfig } from '../../utils/config.ts';
import type { AppConfig, DiscordUser, AuthenticatedRequest } from '../../types/server.ts';
import { verifyUserRole } from '../utils/roleVerifier.ts';
import { getClient } from '../client.ts';
import type { RouteHandler, RainbotRequest, RainbotResponse } from '../http-server.ts';

const log = createLogger('AUTH_ROUTES');

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackURL: string;
  requiredRoleId: string;
}

const getConfig = (): OAuthConfig => {
  const config: AppConfig = loadConfig();

  if (!config.clientId) {
    throw new Error('DISCORD_CLIENT_ID is required for OAuth');
  }
  if (!config.discordClientSecret) {
    throw new Error('DISCORD_CLIENT_SECRET is required for OAuth');
  }
  if (!config.requiredRoleId) {
    throw new Error('REQUIRED_ROLE_ID is required for OAuth');
  }

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

// Simple OAuth2 implementation
class OAuth2Handler {
  private cfg: OAuthConfig;

  constructor() {
    this.cfg = getConfig();
  }

  getAuthURL(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.callbackURL,
      response_type: 'code',
      scope: 'identify guilds',
      ...(state && { state }),
    });

    return `https://discord.com/api/oauth2/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<any> {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.cfg.callbackURL,
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth2 token exchange failed: ${response.status}`);
    }

    return await response.json();
  }

  async getUserInfo(accessToken: string): Promise<DiscordUser> {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    const user = await response.json();

    // Get user's guilds
    const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const guilds = guildsResponse.ok ? await guildsResponse.json() : [];

    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      guilds: guilds.map((g: any) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        permissions: g.permissions,
      })),
    };
  }
}

const oauth = new OAuth2Handler();

// Middleware to require authentication
export const requireAuth: RouteHandler = async (req, res) => {
  if (!req.user) {
    res.status = 401;
    res.body = { error: 'Authentication required' };
    return;
  }
};

// Auth routes
export const authRoutes = {
  // GET /auth/discord
  discord: async (req: RainbotRequest, res: RainbotResponse) => {
    const state = req.query.get('state') || '/';
    const authURL = oauth.getAuthURL(state);

    res.redirect = authURL;
  },

  // GET /auth/discord/callback
  discordCallback: async (req: RainbotRequest, res: RainbotResponse) => {
    const code = req.query.get('code');
    const state = req.query.get('state') || '/';

    if (!code) {
      res.status = 400;
      res.body = { error: 'No authorization code provided' };
      return;
    }

    try {
      const tokenData = await oauth.exchangeCode(code);
      const user = await oauth.getUserInfo(tokenData.access_token);

      // Verify user has required role if configured
      const cfg = getConfig();
      if (cfg.requiredRoleId) {
        const client = getClient();
        if (client) {
          const hasRole = await verifyUserRole(user.id, cfg.requiredRoleId, client);
          if (!hasRole) {
            res.status = 403;
            res.body = { error: 'Insufficient permissions' };
            return;
          }
        }
      }

      // Store user in session
      req.session = req.session || {};
      req.session.user = user;
      req.session.accessToken = tokenData.access_token;

      // Set session cookie
      const sessionId = crypto.randomUUID();
      await req.sessionStore?.set(sessionId, req.session);

      res.headers.set(
        'Set-Cookie',
        `rainbot.sid=${sessionId}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}`
      );
      res.redirect = state;
    } catch (error) {
      log.error('OAuth callback error:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Authentication failed' };
    }
  },

  // GET /auth/check
  check: async (req: RainbotRequest, res: RainbotResponse) => {
    if (req.user) {
      res.body = { authenticated: true, user: req.user };
    } else {
      res.status = 401;
      res.body = { authenticated: false };
    }
  },

  // POST /auth/logout
  logout: async (req: RainbotRequest, res: RainbotResponse) => {
    if (req.session) {
      // Clear session
      req.session = {};
    }

    res.headers.set('Set-Cookie', 'rainbot.sid=; HttpOnly; Path=/; Max-Age=0');
    res.body = { success: true };
  },
};
