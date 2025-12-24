import { Response } from 'express';

/**
 * Server utilities for API routes
 * Provides reusable helpers to reduce duplication across route handlers
 */

/**
 * Standard error response formatter
 */
export function sendError(res: Response, statusCode: number, message: string, details?: any): void {
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
  body: any,
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
export function extractAuthUser(user: any): {
  id: string | null;
  username: string | null;
  discriminator: string | null;
} {
  if (!user) {
    return { id: null, username: null, discriminator: null };
  }
  return {
    id: user.id || null,
    username: user.username || null,
    discriminator: user.discriminator || null,
  };
}

/**
 * Async handler wrapper for route handlers to catch errors
 */
export function asyncHandler(
  fn: (req: any, res: Response, next: any) => Promise<void>
): (req: any, res: Response, next: any) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
