import type { Request, Response, NextFunction } from 'express';
import type { GuildMember } from 'discord.js';
import { getClient } from '../../client';
import { HttpError } from '../../middleware/errorHandler';

interface AuthUser {
  id: string | null;
  username: string | null;
  discriminator: string | null;
}

interface RequestWithGuildMember extends Request {
  guildMember?: GuildMember;
}

export async function requireGuildMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const guildId = req.body?.guildId || req.params?.['guildId'];
  if (!guildId) {
    next();
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const client = getClient();
  if (!client?.isReady()) {
    res.status(503).json({ error: 'Bot not ready' });
    return;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    res.status(404).json({ error: 'Guild not found' });
    return;
  }

  try {
    const member = await guild.members.fetch(userId);
    if (!member) {
      res.status(403).json({ error: 'Not a member of this guild' });
      return;
    }
    (req as RequestWithGuildMember).guildMember = member;
    next();
  } catch {
    res.status(403).json({ error: 'Not a member of this guild' });
  }
}

export function getAuthUser(req: Request): AuthUser {
  const user = req.user;
  if (!user) {
    return { id: null, username: null, discriminator: null };
  }
  return {
    id: user.id || null,
    username: user.username || null,
    discriminator: user.discriminator || null,
  };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export function toHttpError(error: unknown, status = 400): HttpError {
  return new HttpError(status, getErrorMessage(error));
}
