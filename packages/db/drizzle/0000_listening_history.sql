CREATE TABLE "listening_history" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(20) NOT NULL,
  "guild_id" varchar(20) NOT NULL,
  "track_title" varchar(500) NOT NULL,
  "track_url" text,
  "source_type" varchar(20) NOT NULL,
  "is_soundboard" boolean DEFAULT false NOT NULL,
  "duration" integer,
  "played_at" timestamp DEFAULT now() NOT NULL,
  "source" varchar(10) NOT NULL,
  "queued_by" varchar(20),
  "metadata" jsonb,
  CONSTRAINT "listening_history_source_type_check" CHECK ("source_type" IN ('local', 'youtube', 'spotify', 'soundcloud', 'other')),
  CONSTRAINT "listening_history_source_check" CHECK ("source" IN ('discord', 'api'))
);

CREATE INDEX "idx_listening_history_user_id" ON "listening_history" ("user_id");
CREATE INDEX "idx_listening_history_guild_id" ON "listening_history" ("guild_id");
CREATE INDEX "idx_listening_history_played_at" ON "listening_history" ("played_at");
CREATE INDEX "idx_listening_history_user_guild" ON "listening_history" ("user_id", "guild_id");
CREATE INDEX "idx_listening_history_queued_by" ON "listening_history" ("queued_by");
CREATE INDEX "idx_listening_history_guild_date" ON "listening_history" ("guild_id", "played_at" DESC);
