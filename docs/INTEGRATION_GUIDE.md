# Multi-Bot Integration Guide

This document shows how to integrate the multi-bot architecture into the existing Raincloud orchestrator.

## Initialization

In `apps/raincloud/index.js` (or migrated `index.ts`):

```typescript
import { Client, GatewayIntentBits } from 'discord.js';
import { RedisClient } from '../../packages/redis-client/src/client';
import { VoiceStateManager } from './lib/voiceStateManager';
import { ChannelResolver } from './lib/channelResolver';
import { WorkerCoordinator } from './lib/workerCoordinator';
import { createLogger } from './utils/logger';
import voiceStateUpdateHandler from './events/voiceStateUpdateMultibot';

const log = createLogger('MAIN');

// Initialize Redis
const redis = new RedisClient();
await redis.connect();

// Initialize voice state management
const voiceStateManager = new VoiceStateManager(redis);

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Initialize channel resolver
const channelResolver = new ChannelResolver(voiceStateManager, client);

// Initialize worker coordinator
const workerCoordinator = new WorkerCoordinator(voiceStateManager);

// Register voice state update handler
client.on('voiceStateUpdate', (oldState, newState) => {
  voiceStateUpdateHandler.execute(oldState, newState, voiceStateManager);
});

// Export for use in commands
export { voiceStateManager, channelResolver, workerCoordinator };
```

## Command Example: Play Music

Update existing `/play` command to use the orchestrator pattern:

```typescript
// apps/raincloud/commands/voice/play.js (or migrate to .ts)
const { SlashCommandBuilder } = require('discord.js');
const { channelResolver, workerCoordinator, voiceStateManager } = require('../../index');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music')
    .addStringOption((option) =>
      option.setName('url').setDescription('YouTube URL or search query').setRequired(true)
    ),

  async execute(interaction) {
    const url = interaction.options.getString('url');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    await interaction.deferReply();

    // 1. Resolve target channel
    const channelResult = await channelResolver.resolveTargetChannel(guildId, userId);

    if (channelResult.error) {
      return interaction.editReply({
        content: channelResult.message,
        ephemeral: true,
      });
    }

    const channelId = channelResult.channelId!;

    // 2. Ensure Rainbot is connected
    const connectResult = await workerCoordinator.ensureWorkerConnected(
      'rainbot',
      guildId,
      channelId
    );

    if (!connectResult.success) {
      return interaction.editReply({
        content: `Failed to connect music bot: ${connectResult.error}`,
        ephemeral: true,
      });
    }

    // 3. Set active session
    await voiceStateManager.setActiveSession(guildId, channelId);

    // 4. Enqueue track
    const enqueueResult = await workerCoordinator.enqueueTrack(
      guildId,
      url,
      userId,
      interaction.user.username
    );

    if (!enqueueResult.success) {
      return interaction.editReply({
        content: `Failed to add track: ${enqueueResult.message}`,
        ephemeral: true,
      });
    }

    return interaction.editReply({
      content: `✅ Added to queue at position ${enqueueResult.position}`,
    });
  },
};
```

## Command Example: TTS

```typescript
// apps/raincloud/commands/voice/tts.js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('Speak text-to-speech')
    .addStringOption((option) =>
      option.setName('text').setDescription('Text to speak').setRequired(true)
    ),

  async execute(interaction) {
    const text = interaction.options.getString('text');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    await interaction.deferReply();

    // 1. Resolve target channel
    const channelResult = await channelResolver.resolveTargetChannel(guildId, userId);

    if (channelResult.error) {
      return interaction.editReply({
        content: channelResult.message,
        ephemeral: true,
      });
    }

    // 2. Ensure Pranjeet is connected
    await workerCoordinator.ensureWorkerConnected('pranjeet', guildId, channelResult.channelId!);

    // 3. Set active session
    await voiceStateManager.setActiveSession(guildId, channelResult.channelId!);

    // 4. Speak TTS
    const result = await workerCoordinator.speakTTS(guildId, text, undefined, userId);

    if (!result.success) {
      return interaction.editReply(`Failed: ${result.message}`);
    }

    return interaction.editReply(`🗣️ Speaking...`);
  },
};
```

## API Route Example: Play Sound

Update existing API route in `apps/raincloud/server/routes/api.ts`:

```typescript
// Play sound effect
app.post('/api/sounds/:id/play', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const guildId = req.body.guildId;

  if (!userId || !guildId) {
    return res.status(400).json({ error: 'Missing user or guild' });
  }

  // 1. Resolve channel
  const channelResult = await channelResolver.resolveTargetChannel(guildId, userId);

  if (channelResult.error) {
    return res.status(400).json({
      error: channelResult.error,
      message: channelResult.message,
    });
  }

  // 2. Ensure HungerBot is connected
  await workerCoordinator.ensureWorkerConnected('hungerbot', guildId, channelResult.channelId!);

  // 3. Set active session
  await voiceStateManager.setActiveSession(guildId, channelResult.channelId!);

  // 4. Play sound
  const result = await workerCoordinator.playSound(guildId, userId, id);

  if (!result.success) {
    return res.status(500).json({ error: result.message });
  }

  res.json({ success: true });
});
```

## Disconnect Command

```typescript
// apps/raincloud/commands/voice/disconnect.js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect all bots from voice'),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    await interaction.deferReply();

    // Disconnect all workers
    await workerCoordinator.disconnectAllWorkers(guildId);

    return interaction.editReply('👋 Disconnected all bots from voice');
  },
};
```

## Session Management

The orchestrator automatically:

- ✅ Tracks current/last voice channels per user
- ✅ Creates active sessions with 30-min TTL
- ✅ Refreshes session on activity (play/tts/sound)
- ✅ Prevents session conflicts (rejects if active elsewhere)
- ✅ Auto-clears sessions after timeout

## Worker Health Monitoring

Check worker status:

```typescript
const statuses = await workerCoordinator.getWorkersStatus(guildId);

console.log(statuses);
// {
//   rainbot: { connected: true, channelId: '...', playing: true, queueLength: 5 },
//   pranjeet: { connected: true, channelId: '...', playing: false },
//   hungerbot: { connected: true, channelId: '...', playing: false }
// }
```

## Volume Control

```typescript
// Set music volume to 80%
await workerCoordinator.setWorkerVolume('rainbot', guildId, 0.8);

// Set TTS volume to 100%
await workerCoordinator.setWorkerVolume('pranjeet', guildId, 1.0);

// Set soundboard volume to 70%
await workerCoordinator.setWorkerVolume('hungerbot', guildId, 0.7);
```

## Error Handling

All coordinator methods return `{ success: boolean, message?: string }`:

```typescript
const result = await workerCoordinator.enqueueTrack(...);

if (!result.success) {
  // Handle error
  log.error(`Failed to enqueue: ${result.message}`);
  return interaction.reply({
    content: `❌ Error: ${result.message}`,
    ephemeral: true
  });
}

// Success
return interaction.reply(`✅ ${result.message}`);
```

## Testing Locally

1. Start Redis:

```bash
redis-server
```

2. Set environment variables:

```bash
export RAINCLOUD_TOKEN=...
export RAINBOT_TOKEN=...
export PRANJEET_TOKEN=...
export HUNGERBOT_TOKEN=...
export REDIS_URL=redis://localhost:6379
```

3. Start workers:

```bash
# Terminal 1
cd apps/rainbot && npm run dev

# Terminal 2
cd apps/pranjeet && npm run dev

# Terminal 3
cd apps/hungerbot && npm run dev
```

4. Start orchestrator:

```bash
cd apps/raincloud && npm run dev
```

## Next Steps

1. Migrate existing commands to use orchestrator pattern
2. Update API routes to use worker coordinator
3. Add comprehensive error handling
4. Implement health check monitoring
5. Add metrics/observability
6. Write integration tests
