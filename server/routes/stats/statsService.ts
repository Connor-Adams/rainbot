import { query } from '../../../utils/database';
import { QueryBuilder, WhereFilters } from './queryBuilder';

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
    builder.addRawCondition('execution_time_ms IS NOT NULL');

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

  async getSessionStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.source) builder.addCondition('source', filters.source);
    builder.addDateRange('started_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const sessionsQuery = `
      SELECT guild_id,
             channel_id,
             channel_name,
             COUNT(*) as session_count,
             ROUND(AVG(duration_seconds)::numeric, 2) as avg_duration_seconds,
             SUM(duration_seconds) as total_duration_seconds,
             MAX(started_at) as last_started
      FROM voice_sessions
      ${whereClause}
      GROUP BY guild_id, channel_id, channel_name
      ORDER BY session_count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(sessionsQuery, params);
    return { sessions: result?.rows || [] };
  }

  async getRetentionStats(guildId?: string) {
    const clauses: string[] = [];
    const params: string[] = [];
    if (guildId) {
      clauses.push(`guild_id = $${params.length + 1}`);
      params.push(guildId);
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const result = await query(
      `SELECT user_id,
              MIN(joined_at) as first_seen,
              MAX(left_at) as last_seen,
              COUNT(*) as session_count
       FROM user_voice_sessions
       ${whereClause}
       GROUP BY user_id`,
      params
    );

    const rows = result?.rows || [];
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const returningUsers = rows.filter((row: any) => Number(row.session_count) > 1).length;
    const newUsersLast7Days = rows.filter((row: any) => {
      const firstSeen = row.first_seen ? new Date(row.first_seen) : null;
      return firstSeen ? firstSeen >= sevenDaysAgo : false;
    }).length;
    const activeUsersLast30Days = rows.filter((row: any) => {
      const lastSeen = row.last_seen ? new Date(row.last_seen) : null;
      return lastSeen ? lastSeen >= thirtyDaysAgo : false;
    }).length;

    return {
      totalUsers: rows.length,
      returningUsers,
      newUsersLast7Days,
      activeUsersLast30Days,
    };
  }

  async getSearchStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.userId) builder.addCondition('user_id', filters.userId);
    if (filters.source) builder.addCondition('source', filters.source);
    builder.addDateRange('searched_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const q = `
      SELECT query,
             query_type,
             COUNT(*) as count,
             ROUND(AVG(results_count)::numeric, 2) as avg_results,
             SUM(CASE WHEN selected_index IS NOT NULL THEN 1 ELSE 0 END) as selections
      FROM search_stats
      ${whereClause}
      GROUP BY query, query_type
      ORDER BY count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { queries: result?.rows || [] };
  }

  async getUserSessionStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.userId) builder.addCondition('user_id', filters.userId);
    builder.addDateRange('joined_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const q = `
      SELECT user_id,
             guild_id,
             MAX(username) as username,
             MAX(discriminator) as discriminator,
             COUNT(*) as session_count,
             ROUND(AVG(duration_seconds)::numeric, 2) as avg_duration_seconds,
             SUM(duration_seconds) as total_duration_seconds,
             MAX(left_at) as last_seen
      FROM user_voice_sessions
      ${whereClause}
      GROUP BY user_id, guild_id
      ORDER BY session_count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { users: result?.rows || [] };
  }

  async getUserTrackStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.userId) builder.addCondition('user_id', filters.userId);
    if (filters.sourceType) builder.addCondition('source_type', filters.sourceType);
    builder.addDateRange('listened_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const q = `
      SELECT user_id,
             guild_id,
             COUNT(*) as listen_count,
             ROUND(AVG(duration)::numeric, 2) as avg_duration,
             SUM(duration) as total_duration,
             MAX(listened_at) as last_listened_at
      FROM user_track_listens
      ${whereClause}
      GROUP BY user_id, guild_id
      ORDER BY listen_count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { users: result?.rows || [] };
  }

  async getUserDetails(userId: string, guildId?: string) {
    const baseParams: string[] = [userId];
    const guildClause = guildId ? ` AND guild_id = $2` : '';

    const [profileResult, commandsResult, soundsResult, sessionsResult, listensResult] =
      await Promise.all([
        query(
          `SELECT user_id, username, discriminator
           FROM user_profiles
           WHERE user_id = $1`,
          baseParams
        ),
        query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE success = true) as success_count,
                  COUNT(*) FILTER (WHERE success = false) as error_count,
                  MAX(executed_at) as last_executed_at
           FROM command_stats
           WHERE user_id = $1${guildClause}`,
          guildId ? [userId, guildId] : baseParams
        ),
        query(
          `SELECT COUNT(*) as total,
                  MAX(played_at) as last_played_at
           FROM sound_stats
           WHERE user_id = $1${guildClause}`,
          guildId ? [userId, guildId] : baseParams
        ),
        query(
          `SELECT COUNT(*) as session_count,
                  SUM(duration_seconds) as total_duration_seconds,
                  MAX(left_at) as last_left_at
           FROM user_voice_sessions
           WHERE user_id = $1${guildClause}`,
          guildId ? [userId, guildId] : baseParams
        ),
        query(
          `SELECT COUNT(*) as listen_count,
                  SUM(duration) as total_listen_duration,
                  MAX(listened_at) as last_listened_at
           FROM user_track_listens
           WHERE user_id = $1${guildClause}`,
          guildId ? [userId, guildId] : baseParams
        ),
      ]);

    const profile = profileResult?.rows?.[0] || {
      user_id: userId,
      username: null,
      discriminator: null,
    };
    const commandRow = commandsResult?.rows?.[0] || {};
    const soundRow = soundsResult?.rows?.[0] || {};
    const sessionRow = sessionsResult?.rows?.[0] || {};
    const listenRow = listensResult?.rows?.[0] || {};

    const lastActiveCandidates = [
      commandRow.last_executed_at,
      soundRow.last_played_at,
      sessionRow.last_left_at,
      listenRow.last_listened_at,
    ]
      .filter(Boolean)
      .map((value: string) => new Date(value).getTime());

    const lastActive =
      lastActiveCandidates.length > 0
        ? new Date(Math.max(...lastActiveCandidates)).toISOString()
        : null;

    return {
      userId,
      username: profile.username,
      discriminator: profile.discriminator,
      commands: {
        total: Number(commandRow.total || 0),
        successCount: Number(commandRow.success_count || 0),
        errorCount: Number(commandRow.error_count || 0),
        lastExecutedAt: commandRow.last_executed_at || null,
      },
      sounds: {
        total: Number(soundRow.total || 0),
        lastPlayedAt: soundRow.last_played_at || null,
      },
      sessions: {
        count: Number(sessionRow.session_count || 0),
        totalDurationSeconds: Number(sessionRow.total_duration_seconds || 0),
        lastLeftAt: sessionRow.last_left_at || null,
      },
      listens: {
        count: Number(listenRow.listen_count || 0),
        totalDurationSeconds: Number(listenRow.total_listen_duration || 0),
        lastListenedAt: listenRow.last_listened_at || null,
      },
      lastActive,
    };
  }

  async getEngagementStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.sourceType) builder.addCondition('source_type', filters.sourceType);
    builder.addDateRange('started_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const q = `
      SELECT track_title,
             source_type,
             COUNT(*) as play_count,
             COUNT(*) FILTER (WHERE was_completed = true) as completed_count,
             COUNT(*) FILTER (WHERE was_skipped = true) as skipped_count,
             ROUND(AVG(played_seconds)::numeric, 2) as avg_played_seconds,
             ROUND(AVG(duration_seconds)::numeric, 2) as avg_duration_seconds
      FROM track_engagement
      ${whereClause}
      GROUP BY track_title, source_type
      ORDER BY play_count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { tracks: result?.rows || [] };
  }

  async getInteractionStats(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.userId) builder.addCondition('user_id', filters.userId);
    if (filters.interactionType) builder.addCondition('interaction_type', filters.interactionType);
    builder.addDateRange('created_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const q = `
      SELECT interaction_type,
             COUNT(*) as count,
             COUNT(*) FILTER (WHERE success = true) as success_count,
             ROUND(AVG(response_time_ms)::numeric, 2) as avg_response_ms
      FROM interaction_events
      ${whereClause}
      GROUP BY interaction_type
      ORDER BY count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { interactions: result?.rows || [] };
  }

  async getPlaybackStateStats(filters: WhereFilters) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.stateType) builder.addCondition('state_type', filters.stateType);
    if (filters.source) builder.addCondition('source', filters.source);
    builder.addDateRange('created_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();

    const q = `
      SELECT state_type,
             source,
             COUNT(*) as count
      FROM playback_state_changes
      ${whereClause}
      GROUP BY state_type, source
      ORDER BY count DESC
    `;

    const result = await query(q, params);
    return { states: result?.rows || [] };
  }

  async getWebAnalytics(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.userId) builder.addCondition('user_id', filters.userId);
    if (filters.eventType) builder.addCondition('event_type', filters.eventType);
    builder.addDateRange('created_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const q = `
      SELECT event_type,
             event_target,
             COUNT(*) as count,
             ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms
      FROM web_events
      ${whereClause}
      GROUP BY event_type, event_target
      ORDER BY count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { events: result?.rows || [] };
  }

  async getGuildEvents(filters: WhereFilters, limit: number) {
    const builder = new QueryBuilder();
    if (filters.guildId) builder.addCondition('guild_id', filters.guildId);
    if (filters.eventType) builder.addCondition('event_type', filters.eventType);
    builder.addDateRange('created_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();
    const nextIndex = builder.getNextParamIndex();
    params.push(limit as any);

    const q = `
      SELECT event_type,
             COUNT(*) as count,
             MAX(created_at) as last_event
      FROM guild_events
      ${whereClause}
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT $${nextIndex}
    `;

    const result = await query(q, params);
    return { events: result?.rows || [] };
  }

  async getApiLatencyStats(filters: WhereFilters) {
    const builder = new QueryBuilder();
    if (filters.endpoint) builder.addCondition('endpoint', filters.endpoint);
    if (filters.userId) builder.addCondition('user_id', filters.userId);
    builder.addDateRange('created_at', filters.startDate, filters.endDate);

    const { whereClause, params } = builder.build();

    const [overallResult, byEndpointResult] = await Promise.all([
      query(
        `SELECT
           ROUND(AVG(response_time_ms)::numeric, 2) as avg_ms,
           ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 2) as p95_ms,
           ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 2) as p99_ms,
           MAX(response_time_ms) as max_ms,
           MIN(response_time_ms) as min_ms,
           COUNT(*) as sample_count
         FROM api_latency ${whereClause}`,
        params
      ),
      query(
        `SELECT endpoint,
                method,
                COUNT(*) as count,
                ROUND(AVG(response_time_ms)::numeric, 2) as avg_ms
         FROM api_latency ${whereClause}
         GROUP BY endpoint, method
         ORDER BY avg_ms DESC
         LIMIT 50`,
        params
      ),
    ]);

    return {
      overall: overallResult?.rows?.[0] || {
        avg_ms: '0',
        p95_ms: '0',
        p99_ms: '0',
        min_ms: '0',
        max_ms: '0',
        sample_count: '0',
      },
      byEndpoint: byEndpointResult?.rows || [],
    };
  }
}
