# Deployment Guide - Multi-Bot Voice Architecture

This guide covers deploying the complete multi-bot architecture to production.

## Prerequisites

Before deploying, ensure you have:

- ✅ 4 Discord bot applications created
- ✅ All 4 bots invited to your guild with required permissions
- ✅ Redis instance (7+)
- ✅ PostgreSQL database (15+)
- ✅ Node.js 22.12.0+ runtime
- ✅ FFmpeg installed on host
- ✅ Environment variables configured

## Discord Bot Setup

### 1. Create 4 Bot Applications

Go to https://discord.com/developers/applications and create:

1. **Raincloud** - Orchestrator
2. **Rainbot** - Music Worker
3. **Pranjeet** - TTS Worker
4. **HungerBot** - Soundboard Worker

For each application:

- Go to "Bot" section
- Click "Reset Token" and save the token securely
- Enable "SERVER MEMBERS INTENT"
- Enable "MESSAGE CONTENT INTENT"

### 2. Generate Invite URLs

For each bot, generate an OAuth2 URL:

**Raincloud (Orchestrator):**

- Scopes: `bot`, `applications.commands`
- Permissions:
  - View Channels
  - Send Messages
  - Connect
  - Speak
  - Use Slash Commands

**Workers (Rainbot, Pranjeet, HungerBot):**

- Scopes: `bot`
- Permissions:
  - View Channels
  - Connect
  - Speak

### 3. Invite All Bots

Use the generated URLs to invite all 4 bots to your guild.

## Environment Configuration

### Required Environment Variables

Create a `.env` file or set environment variables:

```env
# Bot Tokens (REQUIRED)
RAINCLOUD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ...
RAINBOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ...
PRANJEET_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ...
HUNGERBOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ...

# Discord Configuration
DISCORD_CLIENT_ID=1234567890123456789
DISCORD_CLIENT_SECRET=your_oauth_secret
DISCORD_GUILD_ID=1234567890123456789  # Optional, for faster command deployment

# Infrastructure (REQUIRED)
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/rainbot

# Worker URLs (internal communication)
RAINBOT_URL=http://localhost:3001
PRANJEET_URL=http://localhost:3002
HUNGERBOT_URL=http://localhost:3003

# Web Dashboard
PORT=3000
SESSION_SECRET=generate-a-secure-random-string
CALLBACK_URL=http://localhost:3000/auth/discord/callback

# TTS Configuration (Optional)
TTS_PROVIDER=openai
TTS_API_KEY=sk-...
TTS_VOICE_NAME=alloy

# Logging
LOG_LEVEL=info
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

**Advantages:**

- All services in one stack
- Automatic networking
- Easy to manage
- Includes Redis and PostgreSQL

**Steps:**

1. Clone the repository:

```bash
git clone https://github.com/Connor-Adams/rainbot.git
cd rainbot
```

2. Configure environment:

```bash
cp .env.example .env
# Edit .env with your tokens and configuration
```

3. Start all services:

```bash
docker-compose up -d
```

4. View logs:

```bash
docker-compose logs -f
```

5. Check service health:

```bash
curl http://localhost:3001/health/ready  # Rainbot
curl http://localhost:3002/health/ready  # Pranjeet
curl http://localhost:3003/health/ready  # HungerBot
curl http://localhost:3000/health         # Raincloud
```

6. Stop services:

```bash
docker-compose down
```

### Option 2: Manual Deployment

**Advantages:**

- More control
- Can use existing infrastructure
- Easier to debug

**Steps:**

1. Install dependencies:

```bash
npm install
```

2. Build all packages:

```bash
npm run build
```

3. Start Redis (if not already running):

```bash
redis-server
```

4. Start PostgreSQL (if not already running):

```bash
# Or use existing instance
```

5. Run database migrations:

```bash
yarn db:migrate
```

6. Start workers (separate terminals):

**Terminal 1 - Rainbot:**

```bash
cd apps/rainbot
npm run start
```

**Terminal 2 - Pranjeet:**

```bash
cd apps/pranjeet
npm run start
```

**Terminal 3 - HungerBot:**

```bash
cd apps/hungerbot
npm run start
```

**Terminal 4 - Raincloud:**

```bash
cd apps/raincloud
npm run start
```

### Option 3: Railway / Cloud Platform

**Advantages:**

- Managed infrastructure
- Auto-scaling
- Built-in monitoring

**Steps:**

1. Create 5 services in Railway:
   - raincloud (orchestrator)
   - rainbot (worker)
   - pranjeet (worker)
   - hungerbot (worker)
   - redis (add-on)

2. For each service, configure:
   - Set environment variables
   - Set start command
   - Configure health checks

3. Configure internal networking:

```env
RAINBOT_URL=http://rainbot.railway.internal:3001
PRANJEET_URL=http://pranjeet.railway.internal:3002
HUNGERBOT_URL=http://hungerbot.railway.internal:3003
```

4. Deploy each service

## Health Checks

### Worker Health Endpoints

All workers expose:

- `GET /health/live` - Liveness probe (returns 200 OK)
- `GET /health/ready` - Readiness probe (returns JSON with status)

Example readiness response:

```json
{
  "status": "ok",
  "uptime": 12345,
  "botType": "rainbot",
  "timestamp": 1234567890
}
```

### Monitoring Worker Status

From orchestrator or external monitoring:

```bash
# Check Rainbot
curl http://localhost:3001/status?guildId=123456789

# Response:
{
  "connected": true,
  "channelId": "987654321",
  "playing": true,
  "queueLength": 5,
  "volume": 0.5
}
```

## Troubleshooting

### Workers not starting

**Check logs:**

```bash
docker-compose logs rainbot
docker-compose logs pranjeet
docker-compose logs hungerbot
```

**Common issues:**

- Missing token in environment variables
- Port already in use
- FFmpeg not installed
- Native dependencies not built

**Solutions:**

```bash
# Rebuild with fresh dependencies
docker-compose build --no-cache

# Check FFmpeg
ffmpeg -version

# Check ports
lsof -i :3001
lsof -i :3002
lsof -i :3003
```

### Orchestrator can't reach workers

**Check network connectivity:**

```bash
# From raincloud container
docker-compose exec raincloud curl http://rainbot:3001/health/live
```

**Verify URLs in environment:**

```bash
docker-compose exec raincloud env | grep URL
```

### Redis connection issues

**Check Redis is running:**

```bash
redis-cli ping
# Should return: PONG
```

**Test connection:**

```bash
docker-compose exec raincloud node -e "const redis = require('redis'); const client = redis.createClient({url: process.env.REDIS_URL}); client.connect().then(() => console.log('OK')).catch(e => console.error(e));"
```

### Session conflicts

**Clear stuck sessions:**

```bash
redis-cli
> KEYS session:*
> DEL session:YOUR_GUILD_ID
```

### Permission errors

**Check bot permissions in Discord:**

1. Right-click the bot in member list
2. View "Roles"
3. Ensure it has Connect and Speak permissions

**Check channel-specific permissions:**

1. Right-click voice channel → Edit Channel
2. Go to "Permissions"
3. Check overrides for bot roles

## Monitoring & Observability

### Logs

**View orchestrator logs:**

```bash
docker-compose logs -f raincloud
```

**View worker logs:**

```bash
docker-compose logs -f rainbot pranjeet hungerbot
```

**Log files location:**

- Docker: `/app/logs/` in each container
- Manual: `./logs/` in project root

### Redis Monitoring

**Monitor active sessions:**

```bash
redis-cli
> KEYS session:*
> TTL session:YOUR_GUILD_ID
```

**Monitor worker status:**

```bash
redis-cli
> KEYS worker:*
> GET worker:rainbot:YOUR_GUILD_ID
```

### Metrics (Future)

Recommended metrics to track:

- Worker response time
- Request success/failure rate
- Active sessions count
- Queue lengths
- Connection uptime

## Scaling

### Horizontal Scaling

For high-traffic deployments:

1. **Multiple orchestrator instances**
   - Use load balancer
   - Share Redis instance
   - Session affinity not required

2. **Multiple worker instances per type**
   - Load balance worker requests
   - Each instance handles different guilds
   - Redis tracks worker→guild mapping

3. **Database replication**
   - Read replicas for statistics
   - Master for writes

### Vertical Scaling

Resource recommendations:

**Raincloud (Orchestrator):**

- CPU: 1-2 cores
- RAM: 512MB - 1GB
- Network: Low latency to workers

**Workers:**

- CPU: 1 core each
- RAM: 256MB - 512MB each
- Disk: Minimal (streaming only)

**Redis:**

- RAM: 256MB minimum
- Persistence: AOF or RDB
- Maxmemory policy: allkeys-lru

## Backup & Recovery

### Redis Backup

**Enable persistence:**

```bash
# In redis.conf
save 900 1
save 300 10
save 60 10000
appendonly yes
```

**Manual backup:**

```bash
redis-cli BGSAVE
# Creates dump.rdb
```

### PostgreSQL Backup

```bash
pg_dump -h localhost -U rainbot rainbot > backup.sql
```

### Restore from Backup

**Redis:**

```bash
# Stop Redis
# Replace dump.rdb with backup
# Restart Redis
```

**PostgreSQL:**

```bash
psql -h localhost -U rainbot rainbot < backup.sql
```

## Security Considerations

### Bot Token Security

- ✅ Never commit tokens to git
- ✅ Use environment variables
- ✅ Rotate tokens periodically
- ✅ Use separate tokens per environment (dev/staging/prod)

### Network Security

- ✅ Workers should only be accessible internally
- ✅ Use firewall rules to block external access to worker ports
- ✅ Redis should not be exposed publicly
- ✅ Use TLS for external connections

### Rate Limiting

- ✅ Implement rate limiting on API routes
- ✅ Discord rate limits are handled automatically
- ✅ Monitor for abuse patterns

## Maintenance

### Updating

1. Pull latest changes:

```bash
git pull origin main
```

2. Rebuild:

```bash
docker-compose build
```

3. Deploy:

```bash
docker-compose up -d
```

4. Verify health:

```bash
docker-compose ps
```

### Rolling Updates

For zero-downtime updates:

1. Update workers first (one at a time)
2. Update orchestrator last
3. Monitor logs for errors
4. Rollback if issues occur

## Support

- **Documentation**: See `docs/` directory
- **Issues**: https://github.com/Connor-Adams/rainbot/issues
- **Architecture**: See `docs/MULTIBOT_ARCHITECTURE.md`
- **Integration**: See `docs/INTEGRATION_GUIDE.md`
