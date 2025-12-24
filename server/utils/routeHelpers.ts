import type { Request, Response } from 'express';

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
    ...(message && { message }),
    ...data,
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
  return {
    id: (userObj.id as string) || null,
    username: (userObj.username as string) || null,
    discriminator: (userObj.discriminator as string) || null,
  };
}

/**
 * Async handler wrapper for route handlers to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: unknown) => Promise<void>
): (req: Request, res: Response, next: unknown) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
