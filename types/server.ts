/**
 * Server/API type definitions
 */
import type { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  guildId?: string;
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
