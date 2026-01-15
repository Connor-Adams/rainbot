import { desc, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const listeningHistory = pgTable(
  'listening_history',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 20 }).notNull(),
    guildId: varchar('guild_id', { length: 20 }).notNull(),
    trackTitle: varchar('track_title', { length: 500 }).notNull(),
    trackUrl: text('track_url'),
    sourceType: varchar('source_type', { length: 20 }).notNull(),
    isSoundboard: boolean('is_soundboard').notNull().default(false),
    duration: integer('duration'),
    playedAt: timestamp('played_at', { mode: 'date' }).notNull().defaultNow(),
    source: varchar('source', { length: 10 }).notNull(),
    queuedBy: varchar('queued_by', { length: 20 }),
    metadata: jsonb('metadata'),
  },
  (table) => [
    check(
      'listening_history_source_type_check',
      sql`${table.sourceType} IN ('local', 'youtube', 'spotify', 'soundcloud', 'other')`
    ),
    check('listening_history_source_check', sql`${table.source} IN ('discord', 'api')`),
    index('idx_listening_history_user_id').on(table.userId),
    index('idx_listening_history_guild_id').on(table.guildId),
    index('idx_listening_history_played_at').on(table.playedAt),
    index('idx_listening_history_user_guild').on(table.userId, table.guildId),
    index('idx_listening_history_queued_by').on(table.queuedBy),
    index('idx_listening_history_guild_date').on(table.guildId, desc(table.playedAt)),
  ]
);
