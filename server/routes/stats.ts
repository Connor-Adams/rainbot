import express, { Request, Response } from 'express';
import { query } from '../../utils/database';
import { requireAuth } from '../middleware/auth';
import { statsEmitter } from '../../utils/statistics';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter for stats endpoints
// Protects against abuse and DoS attacks
// Allows 500 requests per 15 minutes per IP
const statsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Parse and validate a date string
 * @param dateStr - Date string to parse
 * @returns Parsed date or null if not provided
 * @throws Error if date string is invalid
 */
function parseValidDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return date;
}

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * Parse date range from query params with validation
 */
function parseDateRange(req: Request): DateRange {
  const startDate = parseValidDate(req.query['startDate'] as string | undefined);
  const endDate = parseValidDate(req.query['endDate'] as string | undefined);
  return { startDate, endDate };
}

interface WhereFilters {
  guildId?: string;
  userId?: string;
  source?: string;
  sourceType?: string;
  isSoundboard?: boolean;
  operationType?: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

/**
 * Build WHERE clause with multiple filters
 */
function buildWhereClause(filters: WhereFilters, params: (string | boolean | Date)[] = []): string {
  const conditions: string[] = [];
  let paramIndex = params.length + 1;

  if (filters.guildId) {
    conditions.push(`guild_id = $${paramIndex++}`);
    params.push(filters.guildId);
  }
  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }
  if (filters.source) {
    conditions.push(`source = $${paramIndex++}`);
    params.push(filters.source);
  }
  if (filters.sourceType) {
    conditions.push(`source_type = $${paramIndex++}`);
    params.push(filters.sourceType);
  }
  if (filters.isSoundboard !== undefined) {
    conditions.push(`is_soundboard = $${paramIndex++}`);
    params.push(filters.isSoundboard);
  }
  if (filters.operationType) {
    conditions.push(`operation_type = $${paramIndex++}`);
    params.push(filters.operationType);
  }
  if (filters.startDate) {
    conditions.push(`executed_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`executed_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

// GET /api/stats/summary - Overall summary
router.get(
  '/summary',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate } = parseDateRange(req);
      const params: Date[] = [];
      let dateFilter = '';

      if (startDate || endDate) {
        const conditions: string[] = [];
        if (startDate) {
          params.push(startDate);
          conditions.push('executed_at >= $' + params.length);
        }
        if (endDate) {
          params.push(endDate);
          conditions.push('executed_at <= $' + params.length);
        }
        dateFilter = 'WHERE ' + conditions.join(' AND ');
      }

      const soundDateFilter = dateFilter.replace(/executed_at/g, 'played_at');

      const [commandsResult, soundsResult, usersResult, guildsResult, successResult] =
        await Promise.all([
          query(`SELECT COUNT(*) as count FROM command_stats ${dateFilter}`, params),
          query(`SELECT COUNT(*) as count FROM sound_stats ${soundDateFilter}`, params),
          query(
            `
                SELECT COUNT(DISTINCT user_id) as count 
                FROM (
                    SELECT user_id FROM command_stats ${dateFilter}
                    UNION
                    SELECT user_id FROM sound_stats ${soundDateFilter}
                ) combined
            `,
            params
          ),
          query(
            `
                SELECT COUNT(DISTINCT guild_id) as count 
                FROM (
                    SELECT guild_id FROM command_stats ${dateFilter}
                    UNION
                    SELECT guild_id FROM sound_stats ${soundDateFilter}
                ) combined
            `,
            params
          ),
          query(
            `SELECT COUNT(*) FILTER (WHERE success = true) as success, COUNT(*) as total FROM command_stats ${dateFilter}`,
            params
          ),
        ]);

      const totalCommands = commandsResult?.rows[0]?.count || 0;
      const totalSounds = soundsResult?.rows[0]?.count || 0;
      const uniqueUsers = usersResult?.rows[0]?.count || 0;
      const uniqueGuilds = guildsResult?.rows[0]?.count || 0;
      const successCount = successResult?.rows[0]?.success || 0;
      const totalCommandCount = successResult?.rows[0]?.total || 0;
      const successRate = totalCommandCount > 0 ? (successCount / totalCommandCount) * 100 : 0;

      res.json({
        totalCommands: parseInt(totalCommands),
        totalSounds: parseInt(totalSounds),
        uniqueUsers: parseInt(uniqueUsers),
        uniqueGuilds: parseInt(uniqueGuilds),
        successRate: Math.round(successRate * 100) / 100,
        timeRange: {
          start: startDate || null,
          end: endDate || null,
        },
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/commands - Command usage stats
router.get(
  '/commands',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters: WhereFilters = {
        guildId: req.query['guildId'] as string | undefined,
        userId: req.query['userId'] as string | undefined,
        source: req.query['source'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | boolean | Date)[] = [];
      const whereClause = buildWhereClause(filters, params);

      // Combined query using window functions to avoid N+1
      const combinedQuery = `
            WITH aggregated AS (
                SELECT command_name,
                       COUNT(*) as count,
                       COUNT(*) FILTER (WHERE success = true) as success_count,
                       COUNT(*) FILTER (WHERE success = false) as error_count
                FROM command_stats
                ${whereClause}
                GROUP BY command_name
            )
            SELECT *,
                   SUM(count) OVER() as total,
                   SUM(success_count) OVER() as total_success
            FROM aggregated
            ORDER BY count DESC
            LIMIT $${params.length + 1}
        `;
      params.push(limit as unknown as string);

      const result = await query(combinedQuery, params);

      // Extract totals from first row (available in all rows via window function)
      const total = parseInt(result?.rows[0]?.total || 0);
      const totalSuccess = parseInt(result?.rows[0]?.total_success || 0);
      const successRate = total > 0 ? (totalSuccess / total) * 100 : 0;

      // Remove the window function columns from response
      const commands = (result?.rows || []).map(
        ({ total: _t, total_success: _ts, ...rest }: Record<string, unknown>) => rest
      );

      res.json({
        commands,
        successRate: Math.round(successRate * 100) / 100,
        total,
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/sounds - Sound playback stats
router.get(
  '/sounds',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        userId: req.query['userId'] as string | undefined,
        sourceType: req.query['sourceType'] as string | undefined,
        isSoundboard:
          req.query['isSoundboard'] !== undefined
            ? req.query['isSoundboard'] === 'true'
            : undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | boolean | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.userId) {
        whereConditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }
      if (filters.sourceType) {
        whereConditions.push(`source_type = $${paramIndex++}`);
        params.push(filters.sourceType);
      }
      if (filters.isSoundboard !== undefined) {
        whereConditions.push(`is_soundboard = $${paramIndex++}`);
        params.push(filters.isSoundboard);
      }
      if (filters.startDate) {
        whereConditions.push(`played_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`played_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Top sounds
      const topSoundsQuery = `
            SELECT sound_name, COUNT(*) as count, 
                   AVG(duration) as avg_duration,
                   SUM(duration) as total_duration
            FROM sound_stats
            ${whereClause}
            GROUP BY sound_name
            ORDER BY count DESC
            LIMIT $${paramIndex}
        `;
      params.push(limit as unknown as string);

      const result = await query(topSoundsQuery, params);

      // Source type breakdown
      const sourceTypeQuery = `
            SELECT source_type, COUNT(*) as count
            FROM sound_stats
            ${whereClause}
            GROUP BY source_type
        `;
      const sourceParams = params.slice(0, -1);
      const sourceResult = await query(sourceTypeQuery, sourceParams);

      // Soundboard vs regular
      const soundboardQuery = `
            SELECT is_soundboard, COUNT(*) as count
            FROM sound_stats
            ${whereClause}
            GROUP BY is_soundboard
        `;
      const soundboardResult = await query(soundboardQuery, sourceParams);

      res.json({
        sounds: result?.rows || [],
        sourceTypes: sourceResult?.rows || [],
        soundboardBreakdown: soundboardResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/users - User activity stats
router.get(
  '/users',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.startDate) {
        whereConditions.push(`executed_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`executed_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const soundWhereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.map((c) => c.replace('executed_at', 'played_at')).join(' AND ')}`
          : '';

      const usersQuery = `
            SELECT 
                COALESCE(c.user_id, s.user_id) AS user_id,
                COALESCE(c.guild_id, s.guild_id) AS guild_id,
                COALESCE(MAX(u.username), MAX(c.username), MAX(s.username)) AS username,
                COALESCE(MAX(u.discriminator), MAX(c.discriminator), MAX(s.discriminator)) AS discriminator,
                COUNT(DISTINCT c.id) AS command_count,
                COUNT(DISTINCT s.id) AS sound_count,
                GREATEST(MAX(c.executed_at), MAX(s.played_at)) AS last_active
            FROM (
                SELECT user_id, guild_id, id, executed_at, username, discriminator
                FROM command_stats 
                ${whereClause}
            ) c
            FULL OUTER JOIN (
                SELECT user_id, guild_id, id, played_at, username, discriminator
                FROM sound_stats 
                ${soundWhereClause}
            ) s ON c.user_id = s.user_id AND c.guild_id = s.guild_id
            LEFT JOIN user_profiles u ON u.user_id = COALESCE(c.user_id, s.user_id)
            GROUP BY COALESCE(c.user_id, s.user_id), COALESCE(c.guild_id, s.guild_id)
            ORDER BY (COUNT(DISTINCT c.id) + COUNT(DISTINCT s.id)) DESC
            LIMIT $${paramIndex}
        `;
      params.push(limit as unknown as string);

      const result = await query(usersQuery, params);

      res.json({
        users: result?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/user-sounds - Which sounds a specific user played (breakdown)
export async function getUserSoundsHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req.query['userId'] as string) || null;
    if (!userId) {
      res.status(400).json({ error: 'Missing required query parameter: userId' });
      return;
    }

    const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 1000);
    const guildId = (req.query['guildId'] as string) || undefined;
    const startDate = parseValidDate(req.query['startDate'] as string | undefined);
    const endDate = parseValidDate(req.query['endDate'] as string | undefined);

    const params: (string | Date | boolean)[] = [];
    let idx = 1;
    const where: string[] = [];

    where.push(`user_id = $${idx++}`);
    params.push(userId);

    if (guildId) {
      where.push(`guild_id = $${idx++}`);
      params.push(guildId);
    }
    if (startDate) {
      where.push(`played_at >= $${idx++}`);
      params.push(startDate);
    }
    if (endDate) {
      where.push(`played_at <= $${idx++}`);
      params.push(endDate);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const q = `
      SELECT sound_name,
             is_soundboard,
             COUNT(*) AS play_count,
             MAX(played_at) AS last_played,
             AVG(duration) AS avg_duration
      FROM sound_stats
      ${whereClause}
      GROUP BY sound_name, is_soundboard
      ORDER BY play_count DESC, last_played DESC
      LIMIT $${idx}
    `;

    params.push(limit as unknown as string);

    const result = await query(q, params);

    res.json({ sounds: result?.rows || [] });
  } catch (error) {
    const err = error as Error;
    const status = err.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
}

router.get('/user-sounds', statsRateLimiter, requireAuth, getUserSoundsHandler);

// GET /api/stats/guilds - Guild activity stats
router.get(
  '/guilds',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: Date[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.startDate) {
        whereConditions.push(`executed_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`executed_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const soundWhereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.map((c) => c.replace('executed_at', 'played_at')).join(' AND ')}`
          : '';

      const guildsQuery = `
            SELECT 
                COALESCE(c.guild_id, s.guild_id) AS guild_id,
                COUNT(DISTINCT c.id) AS command_count,
                COUNT(DISTINCT s.id) AS sound_count,
                COUNT(DISTINCT COALESCE(c.user_id, s.user_id)) AS unique_users,
                GREATEST(MAX(c.executed_at), MAX(s.played_at)) AS last_active
            FROM (
                SELECT guild_id, id, user_id, executed_at 
                FROM command_stats 
                ${whereClause}
            ) c
            FULL OUTER JOIN (
                SELECT guild_id, id, user_id, played_at 
                FROM sound_stats 
                ${soundWhereClause}
            ) s ON c.guild_id = s.guild_id
            GROUP BY COALESCE(c.guild_id, s.guild_id)
            ORDER BY (COUNT(DISTINCT c.id) + COUNT(DISTINCT s.id)) DESC
            LIMIT $${paramIndex}
        `;
      params.push(limit as unknown as Date);

      const result = await query(guildsQuery, params);

      res.json({
        guilds: result?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/time - Time-based trends
router.get(
  '/time',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const granularity = (req.query['granularity'] as string) || 'day'; // hour, day, week, month
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      let dateTrunc: string;
      switch (granularity) {
        case 'hour':
          dateTrunc = "DATE_TRUNC('hour', executed_at)";
          break;
        case 'week':
          dateTrunc = "DATE_TRUNC('week', executed_at)";
          break;
        case 'month':
          dateTrunc = "DATE_TRUNC('month', executed_at)";
          break;
        default:
          dateTrunc = "DATE_TRUNC('day', executed_at)";
      }

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.startDate) {
        whereConditions.push(`executed_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`executed_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const soundWhereConditions = whereConditions.map((c) =>
        c.replace('executed_at', 'played_at')
      );
      const soundWhereClause =
        soundWhereConditions.length > 0 ? `WHERE ${soundWhereConditions.join(' AND ')}` : '';

      const commandsQuery = `
            SELECT ${dateTrunc} as date, COUNT(*) as command_count
            FROM command_stats
            ${whereClause}
            GROUP BY ${dateTrunc}
            ORDER BY date ASC
        `;

      const soundsQuery = `
            SELECT DATE_TRUNC('${granularity}', played_at) as date, COUNT(*) as sound_count
            FROM sound_stats
            ${soundWhereClause}
            GROUP BY DATE_TRUNC('${granularity}', played_at)
            ORDER BY date ASC
        `;

      const [commandsResult, soundsResult] = await Promise.all([
        query(commandsQuery, params),
        query(soundsQuery, params),
      ]);

      res.json({
        granularity,
        commands: commandsResult?.rows || [],
        sounds: soundsResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/queue - Queue operation stats
router.get(
  '/queue',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters: WhereFilters = {
        guildId: req.query['guildId'] as string | undefined,
        operationType: req.query['operationType'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | boolean | Date)[] = [];
      const whereClause = buildWhereClause(filters, params);

      const operationsQuery = `
            SELECT operation_type, COUNT(*) as count
            FROM queue_operations
            ${whereClause}
            GROUP BY operation_type
            ORDER BY count DESC
            LIMIT $${params.length + 1}
        `;
      params.push(limit as unknown as string);

      const result = await query(operationsQuery, params);

      res.json({
        operations: result?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/history - Get listening history (all users or filtered by userId)
router.get(
  '/history',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req.query['userId'] as string) || null; // null means all users
      const guildId = (req.query['guildId'] as string) || null;
      const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 500);
      const startDate = parseValidDate(req.query['startDate'] as string | undefined);
      const endDate = parseValidDate(req.query['endDate'] as string | undefined);

      const listeningHistory = require('../../utils/listeningHistory');
      const history = await listeningHistory.getListeningHistory(
        userId,
        guildId,
        limit,
        startDate,
        endDate
      );

      res.json({
        history: history || [],
        count: history?.length || 0,
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/errors - Error breakdown by type and command
router.get(
  '/errors',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = ['success = false'];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.startDate) {
        whereConditions.push(`executed_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`executed_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Error by type breakdown
      const errorsByTypeResult = await query(
        `SELECT error_type, COUNT(*) as count
       FROM command_stats ${whereClause}
       GROUP BY error_type
       ORDER BY count DESC`,
        params
      );

      // Error by command breakdown
      const errorsByCommandResult = await query(
        `SELECT command_name, error_type, COUNT(*) as count,
              array_agg(DISTINCT error_message) FILTER (WHERE error_message IS NOT NULL) as sample_errors
       FROM command_stats ${whereClause}
       GROUP BY command_name, error_type
       ORDER BY count DESC
       LIMIT 50`,
        params
      );

      // Error rate over time (daily)
      const errorTrendResult = await query(
        `SELECT DATE(executed_at) as date,
              COUNT(*) FILTER (WHERE success = false) as errors,
              COUNT(*) as total,
              ROUND(COUNT(*) FILTER (WHERE success = false)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as error_rate
       FROM command_stats
       ${filters.guildId || filters.startDate || filters.endDate ? whereClause.replace('success = false AND ', '').replace('success = false', '1=1') : ''}
       GROUP BY DATE(executed_at)
       ORDER BY date DESC
       LIMIT 30`,
        params.filter((_, i) => i > 0 || !whereConditions.includes('success = false'))
      );

      res.json({
        byType: errorsByTypeResult?.rows || [],
        byCommand: errorsByCommandResult?.rows || [],
        trend: errorTrendResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/performance - Command execution time percentiles
router.get(
  '/performance',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        commandName: req.query['commandName'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = ['execution_time_ms IS NOT NULL'];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.commandName) {
        whereConditions.push(`command_name = $${paramIndex++}`);
        params.push(filters.commandName);
      }
      if (filters.startDate) {
        whereConditions.push(`executed_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`executed_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Overall percentiles
      const percentilesResult = await query(
        `SELECT
         ROUND(AVG(execution_time_ms), 2) as avg_ms,
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p50_ms,
         ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p95_ms,
         ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p99_ms,
         MAX(execution_time_ms) as max_ms,
         MIN(execution_time_ms) as min_ms,
         COUNT(*) as sample_count
       FROM command_stats ${whereClause}`,
        params
      );

      // By command breakdown
      const byCommandResult = await query(
        `SELECT command_name,
              COUNT(*) as count,
              ROUND(AVG(execution_time_ms), 2) as avg_ms,
              ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p50_ms,
              ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p95_ms
       FROM command_stats ${whereClause}
       GROUP BY command_name
       ORDER BY avg_ms DESC
       LIMIT 20`,
        params
      );

      res.json({
        overall: percentilesResult?.rows[0] || {},
        byCommand: byCommandResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/sessions - Voice session analytics
router.get(
  '/sessions',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.startDate) {
        whereConditions.push(`started_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`started_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Session summary
      const summaryResult = await query(
        `SELECT
         COUNT(*) as total_sessions,
         ROUND(AVG(duration_seconds), 0) as avg_duration_seconds,
         SUM(duration_seconds) as total_duration_seconds,
         ROUND(AVG(tracks_played), 1) as avg_tracks_per_session,
         SUM(tracks_played) as total_tracks,
         ROUND(AVG(user_count_peak), 1) as avg_peak_users
       FROM voice_sessions ${whereClause}`,
        params
      );

      // Recent sessions
      const sessionsResult = await query(
        `SELECT session_id, guild_id, channel_name, started_at, ended_at,
              duration_seconds, tracks_played, user_count_peak
       FROM voice_sessions ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Sessions by day
      const dailyResult = await query(
        `SELECT DATE(started_at) as date,
              COUNT(*) as sessions,
              SUM(duration_seconds) as total_duration,
              SUM(tracks_played) as total_tracks
       FROM voice_sessions ${whereClause}
       GROUP BY DATE(started_at)
       ORDER BY date DESC
       LIMIT 30`,
        params
      );

      res.json({
        summary: summaryResult?.rows[0] || {},
        sessions: sessionsResult?.rows || [],
        daily: dailyResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/retention - User retention and cohort analysis
router.get(
  '/retention',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
      };

      const params: string[] = [];
      let guildFilter = '';
      if (filters.guildId) {
        guildFilter = 'AND guild_id = $1';
        params.push(filters.guildId);
      }

      // Users by first seen date (cohorts)
      const cohortsResult = await query(
        `SELECT DATE(first_seen_at) as cohort_date, COUNT(*) as new_users
       FROM user_profiles
       WHERE first_seen_at IS NOT NULL
       GROUP BY DATE(first_seen_at)
       ORDER BY cohort_date DESC
       LIMIT 30`,
        []
      );

      // Active users by period
      const activeUsersResult = await query(
        `SELECT
         COUNT(DISTINCT user_id) FILTER (WHERE executed_at >= NOW() - INTERVAL '1 day') as daily_active,
         COUNT(DISTINCT user_id) FILTER (WHERE executed_at >= NOW() - INTERVAL '7 days') as weekly_active,
         COUNT(DISTINCT user_id) FILTER (WHERE executed_at >= NOW() - INTERVAL '30 days') as monthly_active,
         COUNT(DISTINCT user_id) as total_users
       FROM command_stats
       WHERE 1=1 ${guildFilter}`,
        params
      );

      // Returning users (users active in last 7 days who were also active 7-14 days ago)
      const returningResult = await query(
        `WITH recent_users AS (
         SELECT DISTINCT user_id FROM command_stats
         WHERE executed_at >= NOW() - INTERVAL '7 days' ${guildFilter}
       ),
       previous_users AS (
         SELECT DISTINCT user_id FROM command_stats
         WHERE executed_at >= NOW() - INTERVAL '14 days'
           AND executed_at < NOW() - INTERVAL '7 days' ${guildFilter}
       )
       SELECT
         (SELECT COUNT(*) FROM recent_users) as recent_active,
         (SELECT COUNT(*) FROM previous_users) as previous_active,
         (SELECT COUNT(*) FROM recent_users r JOIN previous_users p ON r.user_id = p.user_id) as returning_users`,
        params
      );

      res.json({
        cohorts: cohortsResult?.rows || [],
        activeUsers: activeUsersResult?.rows[0] || {},
        returning: returningResult?.rows[0] || {},
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/stats/search - Search query analytics
router.get(
  '/search',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.startDate) {
        whereConditions.push(`searched_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`searched_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Top queries
      const topQueriesResult = await query(
        `SELECT query, query_type, COUNT(*) as count,
              ROUND(AVG(results_count), 1) as avg_results,
              ROUND(AVG(selected_index), 1) as avg_selected_position
       FROM search_stats ${whereClause}
       GROUP BY query, query_type
       ORDER BY count DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Query type breakdown
      const queryTypesResult = await query(
        `SELECT query_type, COUNT(*) as count,
              ROUND(AVG(results_count), 1) as avg_results,
              COUNT(*) FILTER (WHERE selected_index IS NOT NULL) as selections
       FROM search_stats ${whereClause}
       GROUP BY query_type
       ORDER BY count DESC`,
        params
      );

      // Zero results queries (discovery gaps)
      const zeroResultsResult = await query(
        `SELECT query, COUNT(*) as count
       FROM search_stats
       ${whereClause ? whereClause + ' AND' : 'WHERE'} results_count = 0
       GROUP BY query
       ORDER BY count DESC
       LIMIT 20`,
        params
      );

      res.json({
        topQueries: topQueriesResult?.rows || [],
        queryTypes: queryTypesResult?.rows || [],
        zeroResults: zeroResultsResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/user-sessions - User voice session analytics
router.get(
  '/user-sessions',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        userId: req.query['userId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.userId) {
        whereConditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }
      if (filters.startDate) {
        whereConditions.push(`joined_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`joined_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Session summary
      const summaryResult = await query(
        `SELECT
         COUNT(*) as total_sessions,
         COUNT(DISTINCT user_id) as unique_users,
         ROUND(AVG(duration_seconds), 0) as avg_duration_seconds,
         SUM(duration_seconds) as total_duration_seconds,
         ROUND(AVG(tracks_heard), 1) as avg_tracks_per_session,
         SUM(tracks_heard) as total_tracks_heard
       FROM user_voice_sessions ${whereClause}`,
        params
      );

      // Recent sessions
      const sessionsResult = await query(
        `SELECT session_id, user_id, username, guild_id, channel_name,
              joined_at, left_at, duration_seconds, tracks_heard
       FROM user_voice_sessions ${whereClause}
       ORDER BY joined_at DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Top listeners
      const topListenersResult = await query(
        `SELECT user_id, username,
              COUNT(*) as session_count,
              SUM(duration_seconds) as total_duration,
              SUM(tracks_heard) as total_tracks
       FROM user_voice_sessions ${whereClause}
       GROUP BY user_id, username
       ORDER BY total_duration DESC NULLS LAST
       LIMIT 20`,
        params
      );

      res.json({
        summary: summaryResult?.rows[0] || {},
        sessions: sessionsResult?.rows || [],
        topListeners: topListenersResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/user-tracks - User track listening analytics
router.get(
  '/user-tracks',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        userId: req.query['userId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.userId) {
        whereConditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }
      if (filters.startDate) {
        whereConditions.push(`listened_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`listened_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Top tracks heard
      const topTracksResult = await query(
        `SELECT track_title, track_url, source_type,
              COUNT(*) as listen_count,
              COUNT(DISTINCT user_id) as unique_listeners
       FROM user_track_listens ${whereClause}
       GROUP BY track_title, track_url, source_type
       ORDER BY listen_count DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Recent listens
      const recentResult = await query(
        `SELECT user_id, track_title, track_url, source_type, listened_at, queued_by
       FROM user_track_listens ${whereClause}
       ORDER BY listened_at DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Source type breakdown
      const sourceTypesResult = await query(
        `SELECT source_type, COUNT(*) as count
       FROM user_track_listens ${whereClause}
       GROUP BY source_type
       ORDER BY count DESC`,
        params
      );

      res.json({
        topTracks: topTracksResult?.rows || [],
        recentListens: recentResult?.rows || [],
        sourceTypes: sourceTypesResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/user/:userId - Individual user statistics
router.get(
  '/user/:userId',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params['userId'];
      const guildId = req.query['guildId'] as string | undefined;

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const params: string[] = [userId];
      let guildFilter = '';
      if (guildId) {
        guildFilter = 'AND guild_id = $2';
        params.push(guildId);
      }

      // User session stats
      const sessionStatsResult = await query(
        `SELECT
         COUNT(*) as total_sessions,
         SUM(duration_seconds) as total_listening_time,
         ROUND(AVG(duration_seconds), 0) as avg_session_duration,
         SUM(tracks_heard) as total_tracks_heard,
         MAX(joined_at) as last_session
       FROM user_voice_sessions
       WHERE user_id = $1 ${guildFilter}`,
        params
      );

      // Recent sessions
      const recentSessionsResult = await query(
        `SELECT session_id, guild_id, channel_name, joined_at, left_at,
              duration_seconds, tracks_heard
       FROM user_voice_sessions
       WHERE user_id = $1 ${guildFilter}
       ORDER BY joined_at DESC
       LIMIT 10`,
        params
      );

      // Top tracks heard by this user
      const topTracksResult = await query(
        `SELECT track_title, track_url, source_type, COUNT(*) as listen_count
       FROM user_track_listens
       WHERE user_id = $1 ${guildFilter}
       GROUP BY track_title, track_url, source_type
       ORDER BY listen_count DESC
       LIMIT 20`,
        params
      );

      // User profile info
      const profileResult = await query(
        `SELECT username, discriminator, first_seen_at, last_active_at
       FROM user_profiles
       WHERE user_id = $1`,
        [userId]
      );

      res.json({
        userId,
        profile: profileResult?.rows[0] || null,
        sessionStats: sessionStatsResult?.rows[0] || {},
        recentSessions: recentSessionsResult?.rows || [],
        topTracks: topTracksResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/stats/engagement - Track engagement analytics (completion vs skip)
router.get(
  '/engagement',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.startDate) {
        whereConditions.push(`started_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`started_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Overall engagement summary
      const summaryResult = await query(
        `SELECT
         COUNT(*) as total_tracks,
         COUNT(*) FILTER (WHERE was_completed = true) as completed,
         COUNT(*) FILTER (WHERE was_skipped = true) as skipped,
         ROUND(AVG(played_seconds), 0) as avg_played_seconds,
         ROUND(AVG(CASE WHEN duration_seconds > 0 THEN (played_seconds::float / duration_seconds * 100) ELSE 0 END), 1) as avg_completion_percent
       FROM track_engagement ${whereClause}`,
        params
      );

      // Skip reasons breakdown
      const skipReasonsResult = await query(
        `SELECT skip_reason, COUNT(*) as count
       FROM track_engagement
       ${whereClause ? whereClause + ' AND' : 'WHERE'} was_skipped = true
       GROUP BY skip_reason
       ORDER BY count DESC`,
        params
      );

      // Most skipped tracks
      const mostSkippedResult = await query(
        `SELECT track_title, COUNT(*) as skip_count,
              ROUND(AVG(skipped_at_seconds), 0) as avg_skip_position
       FROM track_engagement
       ${whereClause ? whereClause + ' AND' : 'WHERE'} was_skipped = true
       GROUP BY track_title
       ORDER BY skip_count DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Most completed tracks
      const mostCompletedResult = await query(
        `SELECT track_title, COUNT(*) as completion_count
       FROM track_engagement
       ${whereClause ? whereClause + ' AND' : 'WHERE'} was_completed = true
       GROUP BY track_title
       ORDER BY completion_count DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      res.json({
        summary: summaryResult?.rows[0] || {},
        skipReasons: skipReasonsResult?.rows || [],
        mostSkipped: mostSkippedResult?.rows || [],
        mostCompleted: mostCompletedResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/interactions - Interaction events (buttons vs commands)
router.get(
  '/interactions',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        interactionType: req.query['interactionType'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.interactionType) {
        whereConditions.push(`interaction_type = $${paramIndex++}`);
        params.push(filters.interactionType);
      }
      if (filters.startDate) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Interaction type breakdown
      const typeBreakdownResult = await query(
        `SELECT interaction_type, COUNT(*) as count,
              COUNT(*) FILTER (WHERE success = true) as success_count,
              ROUND(AVG(response_time_ms), 0) as avg_response_time_ms
       FROM interaction_events ${whereClause}
       GROUP BY interaction_type
       ORDER BY count DESC`,
        params
      );

      // Top custom_ids (buttons/commands)
      const topActionsResult = await query(
        `SELECT custom_id, interaction_type, COUNT(*) as count,
              COUNT(*) FILTER (WHERE success = true) as success_count,
              ROUND(AVG(response_time_ms), 0) as avg_response_time_ms
       FROM interaction_events ${whereClause}
       GROUP BY custom_id, interaction_type
       ORDER BY count DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Errors
      const errorsResult = await query(
        `SELECT custom_id, interaction_type, error_message, COUNT(*) as count
       FROM interaction_events
       ${whereClause ? whereClause + ' AND' : 'WHERE'} success = false
       GROUP BY custom_id, interaction_type, error_message
       ORDER BY count DESC
       LIMIT 20`,
        params
      );

      // Response time distribution
      const responseTimeResult = await query(
        `SELECT
         COUNT(*) FILTER (WHERE response_time_ms < 100) as under_100ms,
         COUNT(*) FILTER (WHERE response_time_ms >= 100 AND response_time_ms < 500) as between_100_500ms,
         COUNT(*) FILTER (WHERE response_time_ms >= 500 AND response_time_ms < 1000) as between_500_1000ms,
         COUNT(*) FILTER (WHERE response_time_ms >= 1000) as over_1000ms
       FROM interaction_events ${whereClause}`,
        params
      );

      res.json({
        typeBreakdown: typeBreakdownResult?.rows || [],
        topActions: topActionsResult?.rows || [],
        errors: errorsResult?.rows || [],
        responseTimeDistribution: responseTimeResult?.rows[0] || {},
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/playback-states - Playback state changes (volume, pause, etc)
router.get(
  '/playback-states',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        stateType: req.query['stateType'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.stateType) {
        whereConditions.push(`state_type = $${paramIndex++}`);
        params.push(filters.stateType);
      }
      if (filters.startDate) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // State type breakdown
      const stateTypesResult = await query(
        `SELECT state_type, COUNT(*) as count
       FROM playback_state_changes ${whereClause}
       GROUP BY state_type
       ORDER BY count DESC`,
        params
      );

      // Volume distribution (for volume changes)
      const volumeDistResult = await query(
        `SELECT new_value::int as volume_level, COUNT(*) as count
       FROM playback_state_changes
       ${whereClause ? whereClause + ' AND' : 'WHERE'} state_type = 'volume'
       GROUP BY new_value::int
       ORDER BY volume_level`,
        params
      );

      // Pause/resume patterns by hour
      const pausePatternResult = await query(
        `SELECT EXTRACT(HOUR FROM created_at) as hour,
              COUNT(*) FILTER (WHERE state_type = 'pause') as pauses,
              COUNT(*) FILTER (WHERE state_type = 'resume') as resumes
       FROM playback_state_changes ${whereClause}
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
        params
      );

      res.json({
        stateTypes: stateTypesResult?.rows || [],
        volumeDistribution: volumeDistResult?.rows || [],
        pausePatternByHour: pausePatternResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/web-analytics - Web dashboard usage analytics
router.get(
  '/web-analytics',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        guildId: req.query['guildId'] as string | undefined,
        userId: req.query['userId'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.guildId) {
        whereConditions.push(`guild_id = $${paramIndex++}`);
        params.push(filters.guildId);
      }
      if (filters.userId) {
        whereConditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }
      if (filters.startDate) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Event type breakdown
      const eventTypesResult = await query(
        `SELECT event_type, COUNT(*) as count
       FROM web_events ${whereClause}
       GROUP BY event_type
       ORDER BY count DESC`,
        params
      );

      // Top event targets (pages, buttons clicked)
      const topTargetsResult = await query(
        `SELECT event_type, event_target, COUNT(*) as count
       FROM web_events ${whereClause}
       GROUP BY event_type, event_target
       ORDER BY count DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Active web users
      const activeUsersResult = await query(
        `SELECT user_id, COUNT(*) as event_count,
              COUNT(DISTINCT event_type) as unique_event_types,
              MAX(created_at) as last_activity
       FROM web_events ${whereClause}
       GROUP BY user_id
       ORDER BY event_count DESC
       LIMIT 20`,
        params
      );

      res.json({
        eventTypes: eventTypesResult?.rows || [],
        topTargets: topTargetsResult?.rows || [],
        activeUsers: activeUsersResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/guild-events - Guild join/leave events
router.get(
  '/guild-events',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);
      const filters = {
        eventType: req.query['eventType'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.eventType) {
        whereConditions.push(`event_type = $${paramIndex++}`);
        params.push(filters.eventType);
      }
      if (filters.startDate) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Event type summary
      const summaryResult = await query(
        `SELECT event_type, COUNT(*) as count
       FROM guild_events ${whereClause}
       GROUP BY event_type
       ORDER BY count DESC`,
        params
      );

      // Recent events
      const recentEventsResult = await query(
        `SELECT event_type, guild_id, guild_name, member_count, created_at, metadata
       FROM guild_events ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex}`,
        [...params, limit]
      );

      // Net guild growth (joins - leaves) over time
      const growthResult = await query(
        `SELECT DATE(created_at) as date,
              COUNT(*) FILTER (WHERE event_type = 'bot_added') as joins,
              COUNT(*) FILTER (WHERE event_type = 'bot_removed') as leaves
       FROM guild_events ${whereClause}
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
        params
      );

      res.json({
        summary: summaryResult?.rows || [],
        recentEvents: recentEventsResult?.rows || [],
        growth: growthResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/stats/api-latency - API performance metrics
router.get(
  '/api-latency',
  statsRateLimiter,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = {
        endpoint: req.query['endpoint'] as string | undefined,
        startDate: parseValidDate(req.query['startDate'] as string | undefined),
        endDate: parseValidDate(req.query['endDate'] as string | undefined),
      };

      const params: (string | Date)[] = [];
      const whereConditions: string[] = [];
      let paramIndex = 1;

      if (filters.endpoint) {
        whereConditions.push(`endpoint = $${paramIndex++}`);
        params.push(filters.endpoint);
      }
      if (filters.startDate) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Overall latency stats
      const overallResult = await query(
        `SELECT
         COUNT(*) as total_requests,
         ROUND(AVG(response_time_ms), 2) as avg_latency_ms,
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 2) as p50_ms,
         ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 2) as p95_ms,
         ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 2) as p99_ms,
         MAX(response_time_ms) as max_ms
       FROM api_latency ${whereClause}`,
        params
      );

      // By endpoint
      const byEndpointResult = await query(
        `SELECT endpoint, method, COUNT(*) as requests,
              ROUND(AVG(response_time_ms), 2) as avg_latency_ms,
              ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 2) as p95_ms
       FROM api_latency ${whereClause}
       GROUP BY endpoint, method
       ORDER BY requests DESC
       LIMIT 20`,
        params
      );

      // Status code breakdown
      const statusCodesResult = await query(
        `SELECT status_code, COUNT(*) as count
       FROM api_latency ${whereClause}
       GROUP BY status_code
       ORDER BY count DESC`,
        params
      );

      res.json({
        overall: overallResult?.rows[0] || {},
        byEndpoint: byEndpointResult?.rows || [],
        statusCodes: statusCodesResult?.rows || [],
      });
    } catch (error) {
      const err = error as Error;
      const status = err.message.includes('Invalid date') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

export default router;

// Server-Sent Events stream for stats updates
router.get('/stream', statsRateLimiter, requireAuth, (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  res.flushHeaders && res.flushHeaders();

  const send = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // ignore write errors
    }
  };

  const onBatch = (payload: unknown) => send('stats-update', payload);
  const onFlush = (payload: unknown) => send('stats-flushed', payload);

  statsEmitter.on('batchInserted', onBatch);
  statsEmitter.on('flushed', onFlush);

  // Immediately send a ping so client knows connection is live
  send('connected', { ts: new Date().toISOString() });

  req.on('close', () => {
    statsEmitter.off('batchInserted', onBatch);
    statsEmitter.off('flushed', onFlush);
    try {
      res.end();
    } catch {
      // no-op
    }
  });
});

// GET /api/stats/check-tables - quick diagnostic: returns row counts for key stats tables
router.get('/check-tables', statsRateLimiter, requireAuth, async (_req: Request, res: Response) => {
  try {
    const tables = [
      'command_stats',
      'sound_stats',
      'queue_operations',
      'voice_events',
      'search_stats',
      'user_voice_sessions',
      'user_track_listens',
      'track_engagement',
      'interaction_events',
      'playback_state_changes',
      'web_events',
      'guild_events',
      'api_latency',
    ];

    const counts: Record<string, number> = {};
    for (const t of tables) {
      try {
        const r = await query(`SELECT COUNT(*) as count FROM ${t}`);
        counts[t] = parseInt(r?.rows[0]?.count || '0');
      } catch {
        counts[t] = -1; // error reading
      }
    }

    res.json({ tables: counts, ts: new Date().toISOString() });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});
