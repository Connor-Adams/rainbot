import { createLogger } from '../../utils/logger.ts';
import * as voiceManager from '../../utils/voiceManager.ts';
import * as storage from '../../utils/storage.ts';
import { getClient } from '../client.ts';
import * as stats from '../../utils/statistics.ts';
import type { GuildMember } from 'npm:discord.js@14.15.3';
import type { RouteHandler, RainbotRequest, RainbotResponse } from '../http-server.ts';

const log = createLogger('API_ROUTES');

// Audio content type mapping for sound preview
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

interface AuthUser {
  id: string | null;
  username: string | null;
  discriminator: string | null;
}

interface RequestWithGuildMember extends RainbotRequest {
  guildMember?: GuildMember;
}

// Middleware to require authentication
export const requireAuth: RouteHandler = async (req: RainbotRequest, res: RainbotResponse) => {
  if (!req.user) {
    res.status = 401;
    res.body = { error: 'Authentication required' };
    return;
  }
};

/**
 * Middleware to verify user is a member of the requested guild
 */
export const requireGuildMember: RouteHandler = async (
  req: RainbotRequest,
  res: RainbotResponse
) => {
  const guildId = req.body?.guildId || req.params.guildId;
  if (!guildId) {
    return; // Continue to next handler
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status = 401;
    res.body = { error: 'Authentication required' };
    return;
  }

  try {
    const client = getClient();
    if (!client) {
      res.status = 500;
      res.body = { error: 'Discord client not available' };
      return;
    }

    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      res.status = 404;
      res.body = { error: 'Guild not found' };
      return;
    }

    const member = await guild.members.fetch(userId);
    if (!member) {
      res.status = 403;
      res.body = { error: 'You are not a member of this guild' };
      return;
    }

    (req as RequestWithGuildMember).guildMember = member;
  } catch (error) {
    log.error('Guild member verification error:', error as Record<string, unknown>);
    res.status = 500;
    res.body = { error: 'Failed to verify guild membership' };
  }
};

// API routes
export const apiRoutes = {
  // GET /api/voice/status/:guildId
  getVoiceStatus: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.params;

    try {
      const status = voiceManager.getStatus(guildId);
      res.body = status;
    } catch (error) {
      log.error('Failed to get voice status:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },

  // POST /api/voice/join
  joinVoice: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId, channelId } = req.body;

    if (!guildId || !channelId) {
      res.status = 400;
      res.body = { error: 'guildId and channelId are required' };
      return;
    }

    try {
      const client = getClient();
      if (!client) {
        res.status = 500;
        res.body = { error: 'Discord client not available' };
        return;
      }

      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (!channel || channel.type !== 2) {
        // 2 = voice channel
        res.status = 400;
        res.body = { error: 'Invalid voice channel' };
        return;
      }

      const result = await voiceManager.joinChannel(channel as any);
      res.body = result;
    } catch (error) {
      log.error('Failed to join voice channel:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to join voice channel' };
    }
  },

  // POST /api/voice/leave
  leaveVoice: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status = 400;
      res.body = { error: 'guildId is required' };
      return;
    }

    try {
      const result = voiceManager.leaveChannel(guildId);
      res.body = result;
    } catch (error) {
      log.error('Failed to leave voice channel:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to leave voice channel' };
    }
  },

  // GET /api/voice/queue/:guildId
  getQueue: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.params;

    try {
      const queue = await voiceManager.getQueue(guildId);
      res.body = queue;
    } catch (error) {
      log.error('Failed to get queue:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },

  // POST /api/voice/play
  playTrack: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId, query, type } = req.body;

    if (!guildId || !query) {
      res.status = 400;
      res.body = { error: 'guildId and query are required' };
      return;
    }

    try {
      const result = await voiceManager.playSound(
        guildId,
        query,
        req.user?.id || null,
        'web',
        req.user?.username || null,
        req.user?.discriminator || null
      );
      res.body = result;
    } catch (error) {
      log.error('Failed to play track:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to play track' };
    }
  },

  // POST /api/voice/pause
  pausePlayback: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status = 400;
      res.body = { error: 'guildId is required' };
      return;
    }

    try {
      const result = voiceManager.togglePause(
        guildId,
        req.user?.id || null,
        req.user?.username || null
      );
      if (!result.paused) {
        res.status = 400;
        res.body = { error: 'Playback is not currently playing' };
        return;
      }
      res.body = result;
    } catch (error) {
      log.error('Failed to pause playback:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to pause playback' };
    }
  },

  // POST /api/voice/resume
  resumePlayback: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status = 400;
      res.body = { error: 'guildId is required' };
      return;
    }

    try {
      const result = voiceManager.togglePause(
        guildId,
        req.user?.id || null,
        req.user?.username || null
      );
      if (result.paused) {
        res.status = 400;
        res.body = { error: 'Playback is already paused' };
        return;
      }
      res.body = result;
    } catch (error) {
      log.error('Failed to resume playback:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to resume playback' };
    }
  },

  // POST /api/voice/skip
  skipTrack: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status = 400;
      res.body = { error: 'guildId is required' };
      return;
    }

    try {
      const result = await voiceManager.skip(guildId, 1, req.user?.id || null);
      res.body = { skipped: result };
    } catch (error) {
      log.error('Failed to skip track:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to skip track' };
    }
  },

  // POST /api/voice/stop
  stopPlayback: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status = 400;
      res.body = { error: 'guildId is required' };
      return;
    }

    try {
      const result = voiceManager.stopSound(guildId);
      res.body = result;
    } catch (error) {
      log.error('Failed to stop playback:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to stop playback' };
    }
  },

  // GET /api/voice/soundboard/:guildId
  getSoundboard: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.params;

    try {
      const soundboard = await voiceManager.listSounds();
      res.body = soundboard;
    } catch (error) {
      log.error('Failed to get soundboard:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Internal server error' };
    }
  },

  // POST /api/voice/soundboard/play
  playSoundboardSound: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId, soundId } = req.body;

    if (!guildId || !soundId) {
      res.status = 400;
      res.body = { error: 'guildId and soundId are required' };
      return;
    }

    try {
      const result = await voiceManager.playSoundboardOverlay(
        guildId,
        soundId,
        req.user?.id || null,
        'web',
        req.user?.username || null,
        req.user?.discriminator || null
      );
      res.body = result;
    } catch (error) {
      log.error('Failed to play soundboard sound:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to play soundboard sound' };
    }
  },

  // GET /api/guilds
  getGuilds: async (req: RainbotRequest, res: RainbotResponse) => {
    if (!req.user) {
      res.status = 401;
      res.body = { error: 'Authentication required' };
      return;
    }

    try {
      const client = getClient();
      if (!client) {
        res.status = 500;
        res.body = { error: 'Discord client not available' };
        return;
      }

      const guilds = await Promise.all(
        client.guilds.cache.map(async (guild) => {
          const member = await guild.members.fetch(req.user.id).catch(() => null);
          return {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            member: member
              ? {
                  id: member.id,
                  displayName: member.displayName,
                  avatar: member.avatarURL(),
                  roles: member.roles.cache.map((role) => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                  })),
                }
              : null,
          };
        })
      );

      res.body = { guilds };
    } catch (error) {
      log.error('Failed to get guilds:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to get guilds' };
    }
  },

  // GET /api/guilds/:guildId/channels
  getGuildChannels: async (req: RainbotRequest, res: RainbotResponse) => {
    const { guildId } = req.params;

    try {
      const client = getClient();
      if (!client) {
        res.status = 500;
        res.body = { error: 'Discord client not available' };
        return;
      }

      const guild = await client.guilds.fetch(guildId);
      const channels = guild.channels.cache
        .filter((channel) => channel.type === 2) // Voice channels only
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          position: channel.position,
        }))
        .sort((a, b) => a.position - b.position);

      res.body = { channels };
    } catch (error) {
      log.error('Failed to get guild channels:', error as Record<string, unknown>);
      res.status = 500;
      res.body = { error: 'Failed to get guild channels' };
    }
  },
};
