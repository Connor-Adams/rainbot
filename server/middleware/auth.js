const { createLogger } = require('../../utils/logger');
const { verifyUserRole } = require('../utils/roleVerifier');
const server = require('../index');

const log = createLogger('AUTH');

// Cache verification for 5 minutes (300000 ms)
const VERIFICATION_CACHE_TIME = 5 * 60 * 1000;

/**
 * Middleware to require authentication and role verification
 * Checks session and verifies user still has required role
 */
async function requireAuth(req, res, next) {
    // Check if user is authenticated
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const user = req.user;
    if (!user || !user.id) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    // Get config and bot client
    const config = require('../../config.json');
    const botClient = server.getClient();

    if (!config.requiredRoleId) {
        log.error('requiredRoleId not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Check if verification is cached and still valid
    const now = Date.now();
    const lastVerified = req.session.lastVerified || 0;
    const hasAccess = req.session.hasAccess;

    if (hasAccess && (now - lastVerified) < VERIFICATION_CACHE_TIME) {
        // Use cached verification
        return next();
    }

    // Verify user still has required role
    try {
        const hasRole = await verifyUserRole(user.id, config.requiredRoleId, botClient);

        // Update session cache
        req.session.hasAccess = hasRole;
        req.session.lastVerified = now;

        if (!hasRole) {
            log.info(`Access denied for user ${user.username} (${user.id}) - missing required role`);
            return res.status(403).json({ error: 'Access denied: You do not have the required role' });
        }

        log.debug(`Access granted for user ${user.username} (${user.id})`);
        next();
    } catch (error) {
        log.error(`Error verifying access for user ${user.id}: ${error.message}`);
        return res.status(500).json({ error: 'Error verifying access' });
    }
}

module.exports = {
    requireAuth,
};

