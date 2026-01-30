import type { DiscordUser, SessionData } from '@rainbot/types/server';
import type { GuildMember } from 'discord.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      guildId?: string;
      user?: DiscordUser;
      guildMember?: GuildMember;
      session: SessionData;
    }
    interface User extends DiscordUser {}
  }
}

export {};
