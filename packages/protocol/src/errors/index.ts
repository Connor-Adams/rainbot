export type { ErrorResponse } from '../types/common';

/**
 * Shared error base for protocol-level failures.
 * Use for RPC/API errors that should be serialized and sent to clients.
 */
export class ProtocolError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProtocolError';
    Object.setPrototypeOf(this, ProtocolError.prototype);
  }

  toJSON(): { error: string; code?: string; details?: Record<string, unknown> } {
    return {
      error: this.message,
      ...(this.code && { code: this.code }),
      ...(this.details && { details: this.details }),
    };
  }
}
