import type { RainbotContext } from '../index-oak.ts';
import { createLogger } from '../../utils/logger.ts';
import { verifyUserRole } from '../utils/roleVerifier.ts';
import { getClient } from '../client.ts';
import type { DiscordUser } from '../../types/server.ts';

const log = createLogger('AUTH');

// Cache verification for 5 minutes (300000 ms)
const VERIFICATION_CACHE_TIME = 5 * 60 * 1000;

/**
 * Middleware to require authentication and role verification
 * Checks session and verifies user still has required role
 */
export async function requireAuth(ctx: RainbotContext, next: any): Promise<void> {
  // Check if user is authenticated
  if (!ctx.user || !ctx.user.id) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Authentication required' };
    return;
  }

  // Get config and bot client
  const { loadConfig } = await import('../../utils/config.ts');
  const config = loadConfig();
  const botClient = getClient();

  // If no required role is configured, skip role verification (open access)
  if (!config.requiredRoleId) {
    log.debug('No requiredRoleId configured - allowing all authenticated users');
    await next();
    return;
  }

  // Check if verification is cached and still valid
  const session = await ctx.state.session;
  const now = Date.now();
  const lastVerified = session.lastVerified || 0;
  const hasAccess = session.hasAccess;

  if (hasAccess && now - lastVerified < VERIFICATION_CACHE_TIME) {
    log.debug('Using cached role verification for user', ctx.user.id);
    await next();
    return;
  }

  // Verify user has required role
  try {
    const isVerified = await verifyUserRole(ctx.user.id, config.requiredRoleId, botClient);

    if (!isVerified) {
      ctx.response.status = 403;
      ctx.response.body = { error: 'Insufficient permissions' };
      return;
    }

    // Update session cache
    session.hasAccess = true;
    session.lastVerified = now;
    await ctx.state.session;

    await next();
  } catch (error) {
    log.error('Role verification failed:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
}

/**
 * Middleware to verify user is a member of the requested guild
 */
export async function requireGuildMember(ctx: RainbotContext, next: any): Promise<void> {
  const guildId = ctx.params?.guildId;
  if (!guildId) {
    await next();
    return;
  }

  const userId = ctx.user?.id;
  if (!userId) {
    ctx.response.status = 401;
    ctx.response.body = { error: 'Authentication required' };
    return;
  }

  try {
    const botClient = getClient();
    const guild = botClient.guilds.cache.get(guildId);

    if (!guild) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Guild not found' };
      return;
    }

    const member = await guild.members.fetch(userId);
    if (!member) {
      ctx.response.status = 403;
      ctx.response.body = { error: 'Not a member of this guild' };
      return;
    }

    ctx.guildMember = member;
    await next();
  } catch (error) {
    log.error('Guild member verification failed:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
}
