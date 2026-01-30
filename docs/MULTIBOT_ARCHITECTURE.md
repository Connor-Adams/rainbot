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
- Coordinates worker bots via tRPC (commands and status) and HTTP (health only)

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

Commands and status go over **tRPC** (mount at `/trpc`). Only **HTTP** endpoints are the health probes.

### HTTP (health only)

- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

### tRPC procedures

**Common (all workers)**

- `health` (query) - Service health
- `getState` (query) - Connection/playback status for a guild
- `join` (mutation) - Join voice channel
- `leave` (mutation) - Leave voice channel
- `volume` (mutation) - Set volume (0.0 - 1.0)

**Rainbot**

- `enqueue`, `skip`, `pause`, `stop`, `clear`, `getQueue`, `autoplay`, `replay`

**Pranjeet**

- `speak` - Speak TTS

**HungerBot**

- `playSound` - Play sound effect
- `cleanupUser` - Clean up user's player

Raincloud calls workers via tRPC clients (`@rainbot/rpc`); workers implement routers with `createRainbotRouter`, `createPranjeetRouter`, `createHungerbotRouter` from `@rainbot/rpc`.

### Request idempotency

All mutating requests include a `requestId` field. Workers cache responses for 60 seconds to prevent duplicate execution on retries.

Example (join):

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

The internal tRPC control plane is mounted at `/trpc`. Raincloud sends
`x-internal-secret` with **`WORKER_SECRET`**; workers accept either
`x-internal-secret` or `x-worker-secret` when the value matches `WORKER_SECRET`.
Only `WORKER_SECRET` is required (same value on Raincloud and all workers).

### Commands respond "rainbot not ready" (or pranjeet/hungerbot)

Raincloud marks a worker "not ready" when its **RPC health check** fails. The response now includes the failure reason in parentheses (e.g. `Unauthorized`, `connect ECONNREFUSED`).

1. **On Raincloud**, set worker URLs to the **actual** worker endpoints (reachable from Raincloud):
   - Railway: use each service’s public URL or internal hostname (e.g. `https://rainbot-production-xxx.up.railway.app` or `http://rainbot:3001` if same project).
   - If `RAINBOT_URL` is `localhost` or wrong, health checks will fail and the bot will stay "not ready".
2. **Same `WORKER_SECRET`** on Raincloud and on **every** worker. Raincloud sends it as `x-internal-secret` for tRPC; a mismatch causes `Unauthorized` and "not ready".
3. **Reachability**: from the Raincloud process, `curl "$RAINBOT_URL/health/ready"` (with no auth) should return JSON. If it times out or is refused, fix URLs/firewall.

After fixing, wait up to **15 seconds** (health poll interval) or restart Raincloud so it re-marks workers ready.

### Orchestrator can't reach workers

Verify worker URLs in `.env`:

```env
RAINBOT_URL=http://localhost:3001
PRANJEET_URL=http://localhost:3002
HUNGERBOT_URL=http://localhost:3003
WORKER_SECRET=replace-with-a-shared-secret
```
Set `WORKER_SECRET` on Raincloud and on each worker (same value).

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
