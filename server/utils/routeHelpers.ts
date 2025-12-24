import type { Request, Response, NextFunction } from 'express';

/**
 * Server utilities for API routes
 * Provides reusable helpers to reduce duplication across route handlers
 */

/**
 * Standard error response formatter
 */
export function sendError(res: Response, statusCode: number, message: string, details?: unknown): void {
  res.status(statusCode).json({
    error: message,
    ...(details && { details }),
  });
}

/**
 * Standard success response formatter
 */
export function sendSuccess<T>(res: Response, data: T, message?: string): void {
  res.json({
    success: true,
    ...(message && { message }),
    data,
  });
}

/**
 * Validate required fields in request body
 */
export function validateRequiredFields(
  body: Record<string, unknown>,
  fields: string[]
): { isValid: boolean; missing?: string[] } {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null);

  if (missing.length > 0) {
    return { isValid: false, missing };
  }

  return { isValid: true };
}

/**
 * Safe user data extractor
 */
export function extractAuthUser(user: unknown): {
  id: string | null;
  username: string | null;
  discriminator: string | null;
} {
  if (!user || typeof user !== 'object') {
    return { id: null, username: null, discriminator: null };
  }

  const userObj = user as Record<string, unknown>;

  const id = typeof userObj.id === 'string' ? userObj.id : null;
  const username = typeof userObj.username === 'string' ? userObj.username : null;
  const discriminator = typeof userObj.discriminator === 'string' ? userObj.discriminator : null;

  return {
    id,
    username,
    discriminator,
  };
}

/**
 * Async handler wrapper for route handlers to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
