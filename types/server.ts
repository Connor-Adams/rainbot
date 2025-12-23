/**
 * Server and API type definitions
 */

import { Request, Response, NextFunction } from 'express';
import { Client } from 'discord.js';

/**
 * Extended Express Request with session and user
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
    guilds?: any[];
  };
  session: {
    passport?: {
      user?: string;
    };
  };
}

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number;
  sessionSecret: string;
  callbackUrl: string;
  clientId: string;
  clientSecret: string;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Middleware function type
 */
export type Middleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

/**
 * Route handler function type
 */
export type RouteHandler = (req: AuthenticatedRequest, res: Response) => void | Promise<void>;
