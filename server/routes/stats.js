const express = require('express');
const { query } = require('../../utils/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Parse and validate a date string
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null if not provided
 * @throws {Error} If date string is invalid
 */
function parseValidDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return date;
}

/**
 * Parse date range from query params with validation
 */
function parseDateRange(req) {
  const startDate = parseValidDate(req.query.startDate);
  const endDate = parseValidDate(req.query.endDate);
  return { startDate, endDate };
}

/**
 * Build WHERE clause with multiple filters
 */
function buildWhereClause(filters, params = []) {
  const conditions = [];
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
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = parseDateRange(req);
    const params = [];
    let dateFilter = '';

    if (startDate || endDate) {
      const conditions = [];
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
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/stats/commands - Command usage stats
router.get('/commands', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const filters = {
      guildId: req.query.guildId,
      userId: req.query.userId,
      source: req.query.source,
      startDate: parseValidDate(req.query.startDate),
      endDate: parseValidDate(req.query.endDate),
    };

    const params = [];
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
    params.push(limit);

    const result = await query(combinedQuery, params);

    // Extract totals from first row (available in all rows via window function)
    const total = parseInt(result?.rows[0]?.total || 0);
    const totalSuccess = parseInt(result?.rows[0]?.total_success || 0);
    const successRate = total > 0 ? (totalSuccess / total) * 100 : 0;

    // Remove the window function columns from response
    const commands = (result?.rows || []).map(({ total: _t, total_success: _ts, ...rest }) => rest);

    res.json({
      commands,
      successRate: Math.round(successRate * 100) / 100,
      total,
    });
  } catch (error) {
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/stats/sounds - Sound playback stats
router.get('/sounds', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const filters = {
      guildId: req.query.guildId,
      userId: req.query.userId,
      sourceType: req.query.sourceType,
      isSoundboard:
        req.query.isSoundboard !== undefined ? req.query.isSoundboard === 'true' : undefined,
      startDate: parseValidDate(req.query.startDate),
      endDate: parseValidDate(req.query.endDate),
    };

    const params = [];
    let whereConditions = [];
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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
    params.push(limit);

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
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/stats/users - User activity stats
router.get('/users', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const filters = {
      guildId: req.query.guildId,
      startDate: parseValidDate(req.query.startDate),
      endDate: parseValidDate(req.query.endDate),
    };

    const params = [];
    let whereConditions = [];
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
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
    params.push(limit);

    const result = await query(usersQuery, params);

    res.json({
      users: result?.rows || [],
    });
  } catch (error) {
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/stats/guilds - Guild activity stats
router.get('/guilds', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const filters = {
      startDate: parseValidDate(req.query.startDate),
      endDate: parseValidDate(req.query.endDate),
    };

    const params = [];
    let whereConditions = [];
    let paramIndex = 1;

    if (filters.startDate) {
      whereConditions.push(`executed_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      whereConditions.push(`executed_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
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
    params.push(limit);

    const result = await query(guildsQuery, params);

    res.json({
      guilds: result?.rows || [],
    });
  } catch (error) {
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/stats/time - Time-based trends
router.get('/time', requireAuth, async (req, res) => {
  try {
    const granularity = req.query.granularity || 'day'; // hour, day, week, month
    const filters = {
      guildId: req.query.guildId,
      startDate: parseValidDate(req.query.startDate),
      endDate: parseValidDate(req.query.endDate),
    };

    let dateTrunc;
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

    const params = [];
    let whereConditions = [];
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const soundWhereConditions = whereConditions.map((c) => c.replace('executed_at', 'played_at'));
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
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/stats/queue - Queue operation stats
router.get('/queue', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const filters = {
      guildId: req.query.guildId,
      operationType: req.query.operationType,
      startDate: parseValidDate(req.query.startDate),
      endDate: parseValidDate(req.query.endDate),
    };

    const params = [];
    const whereClause = buildWhereClause(filters, params);

    const operationsQuery = `
            SELECT operation_type, COUNT(*) as count
            FROM queue_operations
            ${whereClause}
            GROUP BY operation_type
            ORDER BY count DESC
            LIMIT $${params.length + 1}
        `;
    params.push(limit);

    const result = await query(operationsQuery, params);

    res.json({
      operations: result?.rows || [],
    });
  } catch (error) {
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// GET /api/stats/history - Get listening history (all users or filtered by userId)
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.query.userId || null; // null means all users
    const guildId = req.query.guildId || null;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const startDate = parseValidDate(req.query.startDate);
    const endDate = parseValidDate(req.query.endDate);

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
    const status = error.message.includes('Invalid date') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

module.exports = router;
