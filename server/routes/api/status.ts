import express, { Request, Response } from 'express';
import * as voiceManager from '../../../utils/voiceManager';
import { getClient } from '../../client';

const router = express.Router();

// GET /api/status - Get bot status
router.get('/status', (_req: Request, res: Response): void => {
  const client = getClient();

  if (!client || !client.isReady()) {
    res.json({
      online: false,
      guilds: [],
      connections: [],
    });
    return;
  }

  const guilds = client.guilds.cache.map((guild) => ({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
  }));

  const connections = voiceManager.getAllConnections();

  res.json({
    online: true,
    username: client.user.username,
    discriminator: client.user.discriminator,
    guilds,
    connections,
  });
});

// GET /api/guilds/:id/channels - Get voice channels for a guild
router.get('/guilds/:id/channels', (req: Request, res: Response): void => {
  const client = getClient();

  if (!client || !client.isReady()) {
    res.status(503).json({ error: 'Bot not ready' });
    return;
  }

  const guild = client.guilds.cache.get(req.params['id']!);
  if (!guild) {
    res.status(404).json({ error: 'Guild not found' });
    return;
  }

  const voiceChannels = guild.channels.cache
    .filter((channel) => channel.type === 2) // 2 = GuildVoice
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
    }));

  res.json(voiceChannels);
});

export default router;
