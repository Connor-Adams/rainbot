import type { WhereFilters } from './queryBuilder';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function parseValidDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`Invalid date format: ${dateStr}`);
  }
  return date;
}

export function parseLimit(
  limitStr: string | undefined,
  defaultLimit = 25,
  maxLimit = 100
): number {
  const parsed = parseInt(limitStr || '', 10);
  const limit = Number.isFinite(parsed) ? parsed : defaultLimit;
  return Math.min(Math.max(1, limit), maxLimit);
}

export function parseDateRange(query: Record<string, any>): {
  startDate: Date | null;
  endDate: Date | null;
} {
  return {
    startDate: parseValidDate(query.startDate as string),
    endDate: parseValidDate(query.endDate as string),
  };
}

export function parseFilters(query: Record<string, any>): WhereFilters {
  return {
    guildId: query.guildId as string | undefined,
    userId: query.userId as string | undefined,
    source: query.source as string | undefined,
    sourceType: query.sourceType as string | undefined,
    isSoundboard: query.isSoundboard !== undefined ? query.isSoundboard === 'true' : undefined,
    operationType: query.operationType as string | undefined,
    commandName: query.commandName as string | undefined,
    interactionType: query.interactionType as string | undefined,
    stateType: query.stateType as string | undefined,
    eventType: query.eventType as string | undefined,
    endpoint: query.endpoint as string | undefined,
    ...parseDateRange(query),
  };
}
