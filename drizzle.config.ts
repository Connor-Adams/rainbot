import type { Config } from 'drizzle-kit';

export default {
  schema: './packages/db/src/schema/index.ts',
  out: './packages/db/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
} satisfies Config;
