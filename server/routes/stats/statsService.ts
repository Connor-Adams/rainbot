import { query } from '../utils/database';
import { QueryBuilder, WhereFilters } from '../utils/queryBuilder';

function getSharedFilters(filters: WhereFilters): WhereFilters {
  return {
    guildId: filters.guildId,
    userId: filters.userId,
    source: filters.source,
    startDate: filters.startDate,
    endDate: filters.endDate,
  };
}

function getSoundFilters(filters: WhereFilters): WhereFilters {
  return {
    guildId: filters.guildId,
    userId: filters.userId,
    source: filters.source,
    sourceType: filters.sourceType,
    isSoundboard: filters.isSoundboard,
    startDate: filters.startDate,
    endDate: filters.endDate,
  };
}

export class StatsService {
  async getSummary(filters: WhereFilters) {
    const sharedFilters = getSharedFilters(filters);
    const commandBuilder = new QueryBuilder();
    const { whereClause: commandWhere, params: sharedParams } = commandBuilder
      .addFilters(sharedFilters, 'executed_at')
      .build();
    const soundBuilder = new QueryBuilder();
    const { whereClause: soundWhere } = soundBuilder.addFilters(sharedFilters, 'played_at').build();

    const [commandsResult, soundsResult, usersResult, guildsResult, successResult] =
      await Promise.all([
        query(`SELECT COUNT(*) as count FROM command_stats ${commandWhere}`, sharedParams),
        query(`SELECT COUNT(*) as count FROM sound_stats ${soundWhere}`, sharedParams),
        query(
          `SELECT COUNT(DISTINCT user_id) as count 
           FROM (
             SELECT user_id FROM command_stats ${commandWhere}
             UNION
             SELECT user_id FROM sound_stats ${soundWhere}
           ) combined`,
          sharedParams
        ),
        query(
          `SELECT COUNT(DISTINCT guild_id) as count 
           FROM (
             SELECT guild_id FROM command_stats ${commandWhere}
             UNION
             SELECT guild_id FROM sound_stats ${soundWhere}
           ) combined`,
          sharedParams
        ),
        query(
          `SELECT COUNT(*) FILTER (WHERE success = true) as success, 
                  COUNT(*) as total 
           FROM command_stats ${commandWhere}`,
          sharedParams
        ),
      ]);

    const totalCommands = parseInt(commandsResult?.rows[0]?.count || '0');
    const totalSounds = parseInt(soundsResult?.rows[0]?.count || '0');
    const uniqueUsers = parseInt(usersResult?.rows[0]?.count || '0');
    const uniqueGuilds = parseInt(guildsResult?.rows[0]?.count || '0');
    const successCount = parseInt(successResult?.rows[0]?.success || '0');
    const totalCommandCount = parseInt(successResult?.rows[0]?.total || '0');
    const successRate = totalCommandCount > 0 ? (successCount / totalCommandCount) * 100 : 0;

    return {
      totalCommands,
      totalSounds,
      uniqueUsers,
      uniqueGuilds,
      successRate: Math.round(successRate * 100) / 100,
      timeRange: {
        start: filters.startDate || null,
        end: filters.endDate || null,
      },
    };
  }

  async getCommandStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    const { whereClause, params } = builder.addFilters(filters).build();

    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

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
      LIMIT $${nextIndex}
    `;

    const result = await query(combinedQuery, params);

    const total = parseInt(result?.rows[0]?.total || '0');
    const totalSuccess = parseInt(result?.rows[0]?.total_success || '0');
    const successRate = total > 0 ? (totalSuccess / total) * 100 : 0;

    const commands = (result?.rows || []).map(
      ({ total: _t, total_success: _ts, ...rest }: any) => rest
    );

    return {
      commands,
      successRate: Math.round(successRate * 100) / 100,
      total,
    };
  }

  async getSoundStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    const { whereClause, params } = builder
      .addFilters(getSoundFilters(filters), 'played_at')
      .build();

    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const topSoundsQuery = `
      SELECT sound_name, COUNT(*) as count, 
             AVG(duration) as avg_duration,
             SUM(duration) as total_duration
      FROM sound_stats
      ${whereClause}
      GROUP BY sound_name
      ORDER BY count DESC
      LIMIT $${nextIndex}
    `;

    const sourceParams = params.slice(0, -1);

    const [topSounds, sourceTypes, soundboardBreakdown] = await Promise.all([
      query(topSoundsQuery, params),
      query(
        `SELECT source_type, COUNT(*) as count FROM sound_stats ${whereClause} GROUP BY source_type`,
        sourceParams
      ),
      query(
        `SELECT is_soundboard, COUNT(*) as count FROM sound_stats ${whereClause} GROUP BY is_soundboard`,
        sourceParams
      ),
    ]);

    return {
      sounds: topSounds?.rows || [],
      sourceTypes: sourceTypes?.rows || [],
      soundboardBreakdown: soundboardBreakdown?.rows || [],
    };
  }

  async getUserStats(filters: WhereFilters, limit: number) {
    const commandFilters: WhereFilters = {
      guildId: filters.guildId,
      startDate: filters.startDate,
      endDate: filters.endDate,
    };

    const commandBuilder = new QueryBuilder();
    const { whereClause: commandWhere, params } = commandBuilder
      .addFilters(commandFilters, 'executed_at')
      .build();
    const soundBuilder = new QueryBuilder();
    const { whereClause: soundWhereClause } = soundBuilder
      .addFilters(commandFilters, 'played_at')
      .build();

    const nextIndex = commandBuilder.getNextParamIndex();
    params.push(limit as any);

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
        FROM command_stats ${commandWhere}
      ) c
      FULL OUTER JOIN (
        SELECT user_id, guild_id, id, played_at, username, discriminator
        FROM sound_stats ${soundWhereClause}
      ) s ON c.user_id = s.user_id AND c.guild_id = s.guild_id
      LEFT JOIN user_profiles u ON u.user_id = COALESCE(c.user_id, s.user_id)
      GROUP BY COALESCE(c.user_id, s.user_id), COALESCE(c.guild_id, s.guild_id)
      ORDER BY (COUNT(DISTINCT c.id) + COUNT(DISTINCT s.id)) DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(usersQuery, params);
    return { users: result?.rows || [] };
  }

  async getUserSounds(userId: string, filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    builder.addCondition('user_id', userId);

    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    builder.addDateRange('played_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

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
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { sounds: result?.rows || [] };
  }

  async getGuildStats(filters: WhereFilters, limit: number) {
    const commandBuilder = new QueryBuilder();
    const { whereClause: commandWhere, params } = commandBuilder
      .addDateRange('executed_at', filters.startDate, filters.endDate)
      .build();
    const soundBuilder = new QueryBuilder();
    const { whereClause: soundWhereClause } = soundBuilder
      .addDateRange('played_at', filters.startDate, filters.endDate)
      .build();
    const nextIndex = commandBuilder.getNextParamIndex();
    params.push(limit as any);

    const guildsQuery = `
      SELECT 
        COALESCE(c.guild_id, s.guild_id) AS guild_id,
        COUNT(DISTINCT c.id) AS command_count,
        COUNT(DISTINCT s.id) AS sound_count,
        COUNT(DISTINCT COALESCE(c.user_id, s.user_id)) AS unique_users,
        GREATEST(MAX(c.executed_at), MAX(s.played_at)) AS last_active
      FROM (
        SELECT guild_id, id, user_id, executed_at 
        FROM command_stats ${commandWhere}
      ) c
      FULL OUTER JOIN (
        SELECT guild_id, id, user_id, played_at 
        FROM sound_stats ${soundWhereClause}
      ) s ON c.guild_id = s.guild_id
      GROUP BY COALESCE(c.guild_id, s.guild_id)
      ORDER BY (COUNT(DISTINCT c.id) + COUNT(DISTINCT s.id)) DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(guildsQuery, params);
    return { guilds: result?.rows || [] };
  }

  async getTimeStats(granularity: string, filters: WhereFilters) {
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

    const commandBuilder = new QueryBuilder();
    if (filters.guildId) commandBuilder.addCondition('guild_id', filters.guildId);
    commandBuilder.addDateRange('executed_at', filters.startDate, filters.endDate);
    const { whereClause: commandWhere, params } = commandBuilder.build();

    const soundBuilder = new QueryBuilder();
    if (filters.guildId) soundBuilder.addCondition('guild_id', filters.guildId);
    soundBuilder.addDateRange('played_at', filters.startDate, filters.endDate);
    const { whereClause: soundWhereClause } = soundBuilder.build();

    const commandsQuery = `
      SELECT ${dateTrunc} as date, COUNT(*) as command_count
      FROM command_stats ${commandWhere}
      GROUP BY ${dateTrunc}
      ORDER BY date ASC
    `;

    const soundsQuery = `
      SELECT DATE_TRUNC('${granularity}', played_at) as date, COUNT(*) as sound_count
      FROM sound_stats ${soundWhereClause}
      GROUP BY DATE_TRUNC('${granularity}', played_at)
      ORDER BY date ASC
    `;

    const [commandsResult, soundsResult] = await Promise.all([
      query(commandsQuery, params),
      query(soundsQuery, params),
    ]);

    return {
      granularity,
      commands: commandsResult?.rows || [],
      sounds: soundsResult?.rows || [],
    };
  }

  async getQueueStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    const { whereClause, params } = builder.addFilters(filters, 'executed_at').build();

    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const operationsQuery = `
      SELECT operation_type, COUNT(*) as count
      FROM queue_operations ${whereClause}
      GROUP BY operation_type
      ORDER BY count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(operationsQuery, params);
    return { operations: result?.rows || [] };
  }

  async getErrorStats(filters: WhereFilters) {
    const baseBuilder = new QueryBuilder();
    if (filters.guildId) baseBuilder.addCondition('guild_id', filters.guildId);
    baseBuilder.addDateRange('executed_at', filters.startDate, filters.endDate);
    const { whereClause: baseWhere, params: baseParams } = baseBuilder.build();

    const errorBuilder = new QueryBuilder();
    errorBuilder.addCondition('success', 'false' as any);
    if (filters.guildId) errorBuilder.addCondition('guild_id', filters.guildId);
    errorBuilder.addDateRange('executed_at', filters.startDate, filters.endDate);
    const { whereClause: errorWhere, params: errorParams } = errorBuilder.build();

    const [errorsByType, errorsByCommand, errorTrend] = await Promise.all([
      query(
        `SELECT error_type, COUNT(*) as count
         FROM command_stats ${errorWhere}
         GROUP BY error_type
         ORDER BY count DESC`,
        errorParams
      ),
      query(
        `SELECT command_name, error_type, COUNT(*) as count,
                array_agg(DISTINCT error_message) FILTER (WHERE error_message IS NOT NULL) as sample_errors
         FROM command_stats ${errorWhere}
         GROUP BY command_name, error_type
         ORDER BY count DESC
         LIMIT 50`,
        errorParams
      ),
      query(
        `SELECT DATE(executed_at) as date,
                COUNT(*) FILTER (WHERE success = false) as errors,
                COUNT(*) as total,
                ROUND(COUNT(*) FILTER (WHERE success = false)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as error_rate
         FROM command_stats
         ${baseWhere}
         GROUP BY DATE(executed_at)
         ORDER BY date DESC
         LIMIT 30`,
        baseParams
      ),
    ]);

    return {
      byType: errorsByType?.rows || [],
      byCommand: errorsByCommand?.rows || [],
      trend: errorTrend?.rows || [],
    };
  }

  async getPerformanceStats(filters: WhereFilters) {
    const builder = new QueryBuilder();
    builder.addCondition('execution_time_ms', 'IS NOT NULL' as any);

    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.commandName) builder.addCondition('command_name', filters.commandName);
    builder.addDateRange('executed_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();

    const [percentilesResult, byCommandResult] = await Promise.all([
      query(
        `SELECT
           ROUND(AVG(execution_time_ms)::numeric, 2) as avg_ms,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p50_ms,
           ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p95_ms,
           ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p99_ms,
           MAX(execution_time_ms) as max_ms,
           MIN(execution_time_ms) as min_ms,
           COUNT(*) as sample_count
         FROM command_stats ${whereClause}`,
        params
      ),
      query(
        `SELECT command_name,
                COUNT(*) as count,
                ROUND(AVG(execution_time_ms)::numeric, 2) as avg_ms,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p50_ms,
                ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms)::numeric, 2) as p95_ms
         FROM command_stats ${whereClause}
         GROUP BY command_name
         ORDER BY avg_ms DESC
         LIMIT 20`,
        params
      ),
    ]);

    return {
      overall: percentilesResult?.rows[0] || {
        avg_ms: '0',
        p50_ms: '0',
        p95_ms: '0',
        p99_ms: '0',
        min_ms: '0',
        max_ms: '0',
        sample_count: '0',
      },
      byCommand: byCommandResult?.rows || [],
    };
  }
}
