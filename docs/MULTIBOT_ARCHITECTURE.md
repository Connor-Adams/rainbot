# Multi-Bot Voice Architecture

This document describes the multi-bot voice architecture implemented for Rainbot.

## Architecture Overview

The system consists of 4 Discord bots working together:

```
┌─────────────┐
│  Raincloud  │  Orchestrator - handles commands & coordinates workers
└──────┬──────┘
       │
       ├──────────┬──────────┬──────────┐
       │          │          │          │
   ┌───▼────┐ ┌──▼──────┐ ┌─▼─────────┐
   │Rainbot │ │Pranjeet │ │ HungerBot │
   │(Music) │ │  (TTS)  │ │(Soundboard│
   └────────┘ └─────────┘ └───────────┘
```

### Bot Responsibilities

**Raincloud (Orchestrator)**

- Receives Discord slash commands
- Serves the web dashboard API
- Tracks voice state (current channel, last used channel)
- Manages active sessions
- Coordinates worker bots via REST API

**Rainbot (Music Worker)**

- Queue-based music playback
- Supports YouTube, SoundCloud, Spotify
- Auto-play related tracks
- Volume control

**Pranjeet (TTS Worker)**

- Text-to-speech playback
- Always connected unless explicitly told to leave
- Plays TTS overtop everything (no ducking)
- Supports multiple TTS providers (OpenAI, Google, etc.)

**HungerBot (Soundboard Worker)**

- Soundboard effect playback
- Per-user replacement (user's new SFX cancels their previous)
- Different users can overlap
- Volume control per effect

## State Management

### Redis Keys

```
# Current voice channel (cleared when user leaves)
voice:current:{guildId}:{userId} -> channelId

# Last used voice channel (persists)
voice:last:{guildId}:{userId} -> channelId

# Active session per guild (30min TTL)
session:{guildId} -> {channelId, timestamp, locked}

# Worker connection status
worker:{botType}:{guildId} -> {channelId, connected, lastHeartbeat}

# Volume settings per guild
volume:{guildId}:{botType} -> 0.0-1.0
```

## Channel Selection Logic

When a user requests playback:

1. **User is in voice** → Use their current channel
2. **User not in voice + active session exists** → Reject with error pointing to active channel
3. **User not in voice + no active session** → Use last used channel for that guild/user
4. **No last channel** → Require user to join voice first

## Worker Protocol

All workers expose a REST API with the following endpoints:

### Common Endpoints

- `POST /join` - Join a voice channel
- `POST /leave` - Leave voice channel
- `POST /volume` - Set volume (0.0 - 1.0)
- `GET /status` - Get connection status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

### Bot-Specific Endpoints

**Rainbot**

- `POST /enqueue` - Add track to queue

**Pranjeet**

- `POST /speak` - Speak TTS

**HungerBot**

- `POST /play-sound` - Play sound effect
- `POST /cleanup-user` - Clean up user's player

### Request Idempotency

All mutating requests include a `requestId` field. Workers cache responses for 60 seconds to prevent duplicate execution on retries.

Example:

```json
{
  "requestId": "uuid-here",
  "guildId": "123456789",
  "channelId": "987654321"
}
```

## Connection Lifecycle

### Auto-Rejoin

Workers automatically attempt to rejoin after unexpected network disconnects:

- **NOT** after kick/ban (user action)
- Exponential backoff: 1s, 5s, 15s
- Maximum 3 attempts

### Session Timeout

Active sessions expire after 30 minutes of inactivity. Inactivity is refreshed on:

- New track enqueued
- TTS spoken
- Sound effect played
- Explicit user interaction

## Running the System

### Development (Local)

#### Prerequisites

- Node.js 22.12.0+
- Redis 7+
- PostgreSQL 15+
- FFmpeg
- 4 Discord bot tokens (one for each bot)

#### Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment template:

```bash
cp .env.example .env
```

3. Configure `.env` with your bot tokens:

```env
RAINCLOUD_TOKEN=your_orchestrator_token
RAINBOT_TOKEN=your_music_worker_token
PRANJEET_TOKEN=your_tts_worker_token
HUNGERBOT_TOKEN=your_soundboard_worker_token
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://...
```

4. Start Redis and PostgreSQL:

```bash
# Redis
redis-server

# PostgreSQL (or use Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=rainbot postgres:15-alpine
```

5. Build all packages:

```bash
npm run build
```

6. Start each bot in separate terminals:

**Terminal 1 - Raincloud (Orchestrator)**

```bash
cd apps/raincloud
npm run dev
```

**Terminal 2 - Rainbot (Music)**

```bash
cd apps/rainbot
npm run dev
```

**Terminal 3 - Pranjeet (TTS)**

```bash
cd apps/pranjeet
npm run dev
```

**Terminal 4 - HungerBot (Soundboard)**

```bash
cd apps/hungerbot
npm run dev
```

### Production (Docker Compose)

1. Configure `.env` file with all tokens and URLs

2. Start all services:

```bash
docker-compose up -d
```

3. View logs:

```bash
docker-compose logs -f
```

4. Stop all services:

```bash
docker-compose down
```

### Service URLs

- **Raincloud (Orchestrator)**: http://localhost:3000
- **Rainbot (Music)**: http://localhost:3001
- **Pranjeet (TTS)**: http://localhost:3002
- **HungerBot (Soundboard)**: http://localhost:3003
- **Redis**: localhost:6379
- **PostgreSQL**: localhost:5432

## Bot Setup in Discord

### Create 4 Applications

Create 4 separate Discord applications at https://discord.com/developers/applications:

1. **Raincloud** - Orchestrator
2. **Rainbot** - Music Worker
3. **Pranjeet** - TTS Worker
4. **HungerBot** - Soundboard Worker

### Required Permissions

All bots need:

- ✅ Connect to voice channels
- ✅ Speak in voice channels
- ✅ View Channels
- ✅ Read Messages/View Channels

Raincloud additionally needs:

- ✅ Use Slash Commands
- ✅ Send Messages

### Invite All Bots

Generate OAuth2 URLs for each bot with the required permissions and invite them to your server. All 4 bots must be present in every guild.

## Troubleshooting

### Workers can't connect to Redis

Ensure Redis is running:

```bash
redis-cli ping
# Should return: PONG
```

Check Redis URL in .env:

```env
REDIS_URL=redis://localhost:6379
```

### Worker bot not responding

Check worker health:

```bash
curl http://localhost:3001/health/ready  # Rainbot
curl http://localhost:3002/health/ready  # Pranjeet
curl http://localhost:3003/health/ready  # HungerBot
```

The internal tRPC control plane is mounted at `/trpc` and requires the
`x-internal-secret` header to match `INTERNAL_RPC_SECRET`.

### Orchestrator can't reach workers

Verify worker URLs in `.env`:

```env
RAINBOT_URL=http://localhost:3001
PRANJEET_URL=http://localhost:3002
HUNGERBOT_URL=http://localhost:3003
INTERNAL_RPC_SECRET=replace-with-a-shared-secret
```

In Docker, use service names:

```env
RAINBOT_URL=http://rainbot:3001
PRANJEET_URL=http://pranjeet:3002
HUNGERBOT_URL=http://hungerbot:3003
```

### Session conflicts

If users get "Session active elsewhere" errors:

1. Check active sessions in Redis:

```bash
redis-cli
> KEYS session:*
> GET session:{guildId}
```

2. Clear stuck session:

```bash
redis-cli DEL session:{guildId}
```

## Migration from Single-Bot

The existing single-bot functionality remains in the repository root. To migrate:

1. Keep existing bot running
2. Deploy 4 new bots with new tokens
3. Test multi-bot architecture in staging
4. Switch DNS/URLs to point to Raincloud
5. Deprecate old single bot

## Performance Considerations

- **Worker communication**: 500ms timeout with 3 retries
- **Redis**: Persistent state survives orchestrator restarts
- **Session TTL**: 30 minutes of inactivity
- **Request caching**: 60 seconds for idempotency
- **Concurrent users**: Each user can trigger multiple workers simultaneously

## Security

- All worker endpoints accept only internal requests
- Use network policies to restrict worker→worker communication
- Redis should not be exposed publicly
- Bot tokens are separate (compromise of one doesn't affect others)
- Request idempotency prevents replay attacks within 60s window

## Future Enhancements

- gRPC instead of REST for lower latency
- Worker health monitoring and auto-restart
- Load balancing for multiple worker instances
- Metrics and observability (Prometheus/Grafana)
- Worker→Orchestrator callbacks for events
