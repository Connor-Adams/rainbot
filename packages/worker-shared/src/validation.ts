import { Response } from 'express';

/**
 * Ensure the Discord client is ready before processing a request
 */
export function ensureClientReady(client: { isReady(): boolean }, res: Response): boolean {
  if (!client.isReady()) {
    res.status(503).json({ status: 'error', message: 'Bot not ready' });
    return false;
  }
  return true;
}

/**
 * Validate that required fields are present in a request body
 */
export function validateRequiredFields<T extends Record<string, unknown>>(
  body: T,
  requiredFields: (keyof T)[]
): { valid: boolean; missing?: string[] } {
  const missing: string[] = [];
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      missing.push(String(field));
    }
  }
  return missing.length === 0 ? { valid: true } : { valid: false, missing };
}
