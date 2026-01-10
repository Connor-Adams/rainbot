/**
 * Server/API type definitions
 */
import type { Request, Response, NextFunction } from 'express';
import type { GuildMember } from 'discord.js';
import type { Session } from 'express-session';

/**
 * Discord user stored in session after OAuth authentication
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  guilds?: Array<{
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
  }>;
}

/**
 * Extended session data with our custom properties
 */
export interface SessionData extends Session {
  hasAccess?: boolean;
  lastVerified?: number;
}

/**
 * Extended Request with authentication and guild member info
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  guildId?: string;
  user?: DiscordUser;
  guildMember?: GuildMember;
  session: SessionData;
}

export interface ApiMiddleware {
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void | Promise<void>;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

export interface CorsConfig {
  origin: string | string[] | boolean;
  credentials?: boolean;
  methods?: string[];
}

export interface ServerConfig {
  port: number;
  host: string;
  trustProxy?: boolean;
  rateLimit?: RateLimitConfig;
  cors?: CorsConfig;
}

/**
 * App configuration loaded from config.json/env
 */
export interface AppConfig {
  token?: string;
  clientId?: string;
  discordClientSecret?: string;
  callbackURL?: string;
  requiredRoleId?: string;
  sessionSecret?: string;
  sessionStorePath: string;
  railwayPublicDomain?: string;
  databaseUrl?: string;
  redisUrl?: string;
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Bucket?: string;
  s3Region?: string;
}
