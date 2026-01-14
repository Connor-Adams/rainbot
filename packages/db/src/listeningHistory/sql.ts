export const insertListeningHistorySql = `
  INSERT INTO listening_history 
    (user_id, guild_id, track_title, track_url, source_type, is_soundboard, duration, played_at, source, queued_by, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10)
`;

export const selectListeningHistoryBaseSql = `
  SELECT lh.*, up.username, up.discriminator
  FROM listening_history lh
  LEFT JOIN user_profiles up ON lh.user_id = up.user_id
`;

export const selectRecentHistorySql = `
  SELECT * FROM listening_history 
  WHERE user_id = $1 AND guild_id = $2
  ORDER BY played_at DESC
  LIMIT 50
`;

export const deleteListeningHistoryByGuildSql =
  'DELETE FROM listening_history WHERE user_id = $1 AND guild_id = $2';

export const deleteListeningHistoryByUserSql = 'DELETE FROM listening_history WHERE user_id = $1';
