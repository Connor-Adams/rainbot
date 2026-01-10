import type { Response, NextFunction } from 'express';
import { createLogger } from '../../utils/logger.ts';
import { verifyUserRole } from '../utils/roleVerifier.ts';
import { getClient } from '../client.ts';
import type { AuthenticatedRequest, DiscordUser } from '../../types/server.ts';

const log = createLogger('AUTH');

// Cache verification for 5 minutes (300000 ms)
const VERIFICATION_CACHE_TIME = 5 * 60 * 1000;

/**
 * Middleware to require authentication and role verification
 * Checks session and verifies user still has required role
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Check if user is authenticated
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = req.user as DiscordUser | undefined;
  if (!user || !user.id) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  // Get config and bot client
  const { loadConfig } = require('../../utils/config');
  const config = loadConfig();
  const botClient = getClient();

  // If no required role is configured, skip role verification (open access)
  if (!config.requiredRoleId) {
    log.debug('No requiredRoleId configured - allowing all authenticated users');
    next();
    return;
  }

  // Check if verification is cached and still valid
  const now = Date.now();
  const lastVerified = req.session?.lastVerified || 0;
  const hasAccess = req.session?.hasAccess;

  if (hasAccess && now - lastVerified < VERIFICATION_CACHE_TIME) {
    // Use cached verification
    next();
    return;
  }

  // Verify user still has required role
  try {
    const hasRole = await verifyUserRole(user.id, config.requiredRoleId, botClient);

    // Update session cache
    if (req.session) {
      req.session.hasAccess = hasRole;
      req.session.lastVerified = now;
    }

    if (!hasRole) {
      log.info(`Access denied for user ${user.username} (${user.id}) - missing required role`);
      res.status(403).json({ error: 'Access denied: You do not have the required role' });
      return;
    }

    log.debug(`Access granted for user ${user.username} (${user.id})`);
    next();
  } catch (error) {
    const err = error as Error;
    log.error(`Error verifying access for user ${user.id}: ${err.message}`);
    res.status(500).json({ error: 'Error verifying access' });
  }
}
