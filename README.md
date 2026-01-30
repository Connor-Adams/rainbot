# Rainbot

Multi-bot Discord voice system with a web dashboard.

## Architecture (4 bots)

- Raincloud: orchestrator + API (no UI; dashboard is separate)
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

- `yarn validate` (type-check, lint, format check, test)
- `yarn format` (Prettier via turbo in all workspace packages)
- `yarn dev` (turbo dev – runs all apps including Raincloud and workers)
- `yarn build`
- `yarn workspace @rainbot/raincloud dev` – run only the orchestrator (API + Discord commands)

## Docs

- `docs/MULTIBOT_ARCHITECTURE.md`
- `docs/TYPES_CANONICAL.md`
- `docs/FUTURE_WORK.md`
- `RAILWAY_DEPLOY.md`
- `OAUTH_SETUP.md`

## Project layout

- **Slash commands**: `apps/raincloud/commands/` is canonical. Root `commands/` is a legacy duplicate; the app loads from the raincloud path when run from the repo root.

## UI

The dashboard lives in `ui/`. Deploy it separately (see `ui/railway.json`); it talks to Raincloud via `VITE_API_BASE_URL` / `VITE_AUTH_BASE_URL`.
