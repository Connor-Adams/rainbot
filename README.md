# Rainbot 🌧️

A Discord voice bot with multi-bot architecture for enhanced audio playback, featuring a web dashboard and comprehensive voice control.

## Architecture

Rainbot uses a **Yarn workspaces monorepo** with a **4-bot orchestrated architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Railway Project                          │
│                                                                 │
│  ┌─────────────┐                                                │
│  │     UI      │◄──── Public URL (only public-facing service)   │
│  │  (React)    │                                                │
│  └──────┬──────┘                                                │
│         │ Proxy /api, /auth (internal network)                  │
│         ▼                                                       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  Raincloud  │────►│   Rainbot   │     │  Pranjeet   │       │
│  │(Orchestrator)│    │   (Music)   │     │   (TTS)     │       │
│  └──────┬──────┘     └─────────────┘     └─────────────┘       │
│         │                                                       │
│         └───────────►┌─────────────┐                           │
│                      │  HungerBot  │                           │
│                      │ (Soundboard)│                           │
│                      └─────────────┘                           │
│                                                                 │
│  All backend services use Railway internal networking          │
└─────────────────────────────────────────────────────────────────┘
```

### Workspace Structure

```
rainbot/
├── apps/
│   ├── raincloud/     # Orchestrator - commands, API, coordination
│   ├── rainbot/       # Music worker - queue-based playback
│   ├── pranjeet/      # TTS worker - text-to-speech
│   └── hungerbot/     # Soundboard worker - sound effects
├── packages/
│   ├── shared/        # Shared utilities and types
│   ├── redis-client/  # Redis client wrapper
│   └── worker-protocol/ # Worker communication protocol
├── ui/                # React + Tailwind dashboard
└── package.json       # Root workspace config
```

See [Multi-Bot Architecture Documentation](docs/MULTIBOT_ARCHITECTURE.md) for details.

## Features

- 🎵 **Multi-source audio playback**: Local files, YouTube, SoundCloud, Spotify
- 🎭 **Separated audio channels**: Music, TTS, and soundboard on independent bots
- 🔊 **Smart voice management**: Auto-join with per-user channel fallback
- 📋 **Queue system**: Advanced queue management with pre-buffering
- 🎤 **Voice interaction**: Optional voice command control
- 🎛️ **Web Dashboard**: Beautiful React + Tailwind interface
- 📤 **Sound upload**: Manage sound files through the dashboard
- 🎮 **Slash commands**: Easy-to-use Discord commands
- 📊 **Statistics**: Comprehensive tracking with PostgreSQL
- 🔄 **Redis state**: Persistent session management

## Quick Start

### Prerequisites

- Node.js v22.12.0 or higher
- Yarn 4+ (Corepack enabled)
- Redis 7+
- PostgreSQL 15+
- FFmpeg
- yt-dlp
- 4 Discord bot tokens (Raincloud, Rainbot, Pranjeet, HungerBot)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd rainbot
```

2. Enable Corepack and install dependencies:

```bash
corepack enable
yarn install
```

3. Install system dependencies:

   **FFmpeg:**
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt-get install ffmpeg`

   **yt-dlp:**
   - **macOS**: `brew install yt-dlp`
   - **Linux**: `pip install yt-dlp`

4. Configure the bot:

   Create a `.env` file in the project root:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in your bot credentials.

   **Note**: For production (Railway), set environment variables in the platform dashboard.

5. Build TypeScript:

```bash
yarn build:ts
```

6. Start local infrastructure (Redis + PostgreSQL):

```bash
docker-compose up -d
```

7. Start the services:

```bash
# In separate terminals:
node apps/raincloud/index.js
node apps/rainbot/dist/index.js
node apps/pranjeet/dist/index.js
node apps/hungerbot/dist/index.js

# For UI development:
yarn workspace @rainbot/ui dev
```

## Configuration

### Environment Variables

Each service needs specific environment variables. Create a `.env` file based on `.env.example`:

**Required for all bots:**

- `DISCORD_CLIENT_ID` - Discord application client ID
- `RAINCLOUD_TOKEN` - Raincloud bot token (orchestrator)
- `RAINBOT_TOKEN` - Rainbot worker token
- `PRANJEET_TOKEN` - Pranjeet worker token
- `HUNGERBOT_TOKEN` - HungerBot worker token

**For Web Dashboard (OAuth):**

- `DISCORD_CLIENT_SECRET` - OAuth client secret
- `SESSION_SECRET` - Session encryption key
- `REQUIRED_ROLE_ID` - Discord role ID for dashboard access

**Infrastructure:**

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

**Optional:**

- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` - For Spotify URL support
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET` - For S3 storage

See **[OAUTH_SETUP.md](./OAUTH_SETUP.md)** for detailed OAuth configuration.

### Bot Permissions

Each bot needs these Discord permissions:

- Connect to voice channels
- Speak in voice channels
- Use slash commands
- View Channels
- Read Message History (optional)

## Commands

### Voice Commands

- `/join` - Join your current voice channel
- `/leave` - Leave the current voice channel
- `/play <source>` - Play a sound file, YouTube/SoundCloud URL, or playlist
- `/queue` - View the current queue
- `/skip` - Skip the current track
- `/pause` - Pause playback
- `/stop` - Stop playback
- `/clear` - Clear the queue
- `/autoplay [enabled]` - Toggle autoplay mode

### Utility Commands

- `/ping` - Check bot latency

## Web Dashboard

The dashboard is served separately and proxies API requests to Raincloud over Railway's internal network.

### Dashboard Features

- **Voice Connections**: View active voice channel connections
- **Server List**: Browse all servers the bots are in
- **URL Player**: Play YouTube, SoundCloud, or direct audio URLs
- **Sound Library**: Browse and play uploaded sound files
- **Statistics Dashboard**: Command usage, playback stats, user activity

### Local Development

```bash
# Start Raincloud (API server)
node apps/raincloud/index.js

# Start UI dev server (in another terminal)
yarn workspace @rainbot/ui dev
```

## Development

### Build Commands

```bash
# Install all dependencies
yarn install

# Build TypeScript
yarn build:ts

# Build UI for production
yarn workspace @rainbot/ui build

# Type check
yarn type-check

# Lint
yarn lint

# Format
yarn format

# Run all validations
yarn validate
```

### Adding New Commands

1. Create a new file in `commands/[category]/[command-name].js`
2. Export a command object with `data` (SlashCommandBuilder) and `execute` function
3. Commands auto-deploy when bots start

### Adding Sound Files

- Place audio files in the `sounds/` directory, or
- Upload files through the web dashboard

## Testing

This project uses Jest with ts-jest for test coverage.

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage
```

Tests are organized in `__tests__` directories next to source files.

## Railway Deployment

The project deploys to Railway as 5 separate services using Nixpacks:

| Service   | Package              | Public                    |
| --------- | -------------------- | ------------------------- |
| Raincloud | `@rainbot/raincloud` | No (internal API)         |
| Rainbot   | `@rainbot/rainbot`   | No                        |
| Pranjeet  | `@rainbot/pranjeet`  | No                        |
| HungerBot | `@rainbot/hungerbot` | No                        |
| UI        | `@rainbot/ui`        | Yes (only public service) |

### Service Configuration

Each service has its own `railway.json` with Turborepo-scoped builds:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "yarn install --immutable && yarn turbo run build:ts --filter=@rainbot/raincloud"
  }
}
```

### Internal Networking

The UI proxies to Raincloud using Railway's internal network:

```
UI Service → http://raincloud.railway.internal:3001 → Raincloud API
```

Set `RAINCLOUD_URL` in the UI service to use internal networking.

### Environment Variables per Service

**Raincloud:**

- `RAINCLOUD_TOKEN` - Bot token
- `DATABASE_URL`, `REDIS_URL` - Infrastructure
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` - OAuth

**Workers (Rainbot, Pranjeet, HungerBot):**

- `RAINBOT_TOKEN` / `PRANJEET_TOKEN` / `HUNGERBOT_TOKEN`
- `REDIS_URL`

**UI:**

- `RAINCLOUD_URL` - Internal URL to Raincloud (e.g., `http://raincloud.railway.internal:3001`)

## Troubleshooting

### Bot won't join voice channel

- Ensure the bot has "Connect" and "Speak" permissions
- Check that you're in a voice channel when using `/join`

### Audio playback issues

- Verify FFmpeg is installed: `ffmpeg -version`
- Verify yt-dlp is installed: `yt-dlp --version`
- Check logs in `logs/error.log`

### YouTube 403 Forbidden errors

See [YouTube 403 Fix Guide](docs/YOUTUBE_403_FIX.md):

- Export YouTube cookies and set `YTDLP_COOKIES` environment variable

### Dashboard not loading

- Ensure Raincloud is running (API server)
- Check `RAINCLOUD_URL` is set correctly in UI service
- Verify Railway internal networking for production

## Documentation

- **[Architecture](ARCHITECTURE.md)** - System design and multi-bot architecture
- **[Voice Module](utils/voice/README.md)** - Voice subsystem design and concurrency
- **[OAuth Setup](OAUTH_SETUP.md)** - Dashboard authentication
- **[Railway Deploy](RAILWAY_DEPLOY.md)** - Railway deployment guide
- **[Voice Interaction](VOICE_INTERACTION_GUIDE.md)** - Voice command setup

## License

ISC
