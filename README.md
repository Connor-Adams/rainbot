# Rainbot

Multi-bot Discord voice system with a web dashboard.

## Architecture (4 bots)

- Raincloud: orchestrator + API/dashboard
- Rainbot: music playback worker
- Pranjeet: TTS worker
- Hungerbot: soundboard worker

Details: `docs/MULTIBOT_ARCHITECTURE.md`

## Quick start (local)

Prereqs: Node 22+, Redis, Postgres (optional for stats), FFmpeg, 4 Discord bot tokens.

```bash
yarn install
cp .env.example .env
yarn dev
```

## Key env vars

- DISCORD_BOT_TOKEN (Raincloud)
- RAINBOT_TOKEN / PRANJEET_TOKEN / HUNGERBOT_TOKEN
- RAINCLOUD_BOT_ID (or ORCHESTRATOR_BOT_ID)
- RAINCLOUD_URL
- WORKER_SECRET
- RAINBOT_URL / PRANJEET_URL / HUNGERBOT_URL
- INTERNAL_RPC_SECRET
- REDIS_URL
- DATABASE_URL (optional)

## Scripts

- `yarn validate` (type-check, lint, format, test)
- `yarn dev` (turbo dev)
- `yarn build`

## Docs

- `docs/MULTIBOT_ARCHITECTURE.md`
- `RAILWAY_DEPLOY.md`
- `OAUTH_SETUP.md`
- `VOICE_INTERACTION_GUIDE.md`

## UI

The dashboard lives in `ui/`.
