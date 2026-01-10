import { createLogger } from '../../utils/logger.ts';
import * as stats from '../../utils/statistics.ts';
import type { RouteHandler, RainbotRequest, RainbotResponse } from '../http-server.ts';

const log = createLogger('STATS_ROUTES');

// Middleware to require authentication
export const requireAuth: RouteHandler = async (req, res) => {
  if (!req.user) {
    res.status = 401;
    res.body = { error: 'Authentication required' };
    return;
  }
};

// Stats routes
export const statsRoutes = {
  // GET /api/stats
  getStats: async (req: RainbotRequest, res: RainbotResponse) => {
    try {
      const overallStats = await stats.getOverallStats();
      res.body = overallStats;
    } catch (error) {
      log.error('Failed to get statistics:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },

  // GET /api/stats/guilds/:guildId
  getGuildStats: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.params;

    try {
      const guildStats = await stats.getGuildStats(guildId);
      res.body = guildStats;
    } catch (error) {
      log.error('Failed to get guild statistics:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },

  // GET /api/stats/tracks/top
  getTopTracks: async (req: RainbotRequest, res: RainbotResponse) => {
    try {
      const topTracks = await stats.getTopTracks();
      res.body = topTracks;
    } catch (error) {
      log.error('Failed to get top tracks:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },

  // GET /api/stats/users/top
  getTopUsers: async (req: RainbotRequest, res: RainbotResponse) => {
    try {
      const topUsers = await stats.getTopUsers();
      res.body = topUsers;
    } catch (error) {
      log.error('Failed to get top users:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },

  // GET /api/stats/commands/top
  getTopCommands: async (req: RainbotRequest, res: RainbotResponse) => {
    try {
      const topCommands = await stats.getTopCommands();
      res.body = topCommands;
    } catch (error) {
      log.error('Failed to get top commands:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },
};
