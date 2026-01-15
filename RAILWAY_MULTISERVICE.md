# Railway Multi-Service Deployment Guide

This guide explains how to deploy the Rainbot multi-bot architecture on Railway.

## Architecture Overview

The system consists of 4 services (plus an optional UI service):

| Service       | Description                      | Port | Docker Image                                  |
| ------------- | -------------------------------- | ---- | --------------------------------------------- |
| **raincloud** | Orchestrator bot + web dashboard | 3000 | `ghcr.io/connor-adams/rainbot-raincloud`      |
| **rainbot**   | Music worker bot                 | 3001 | `ghcr.io/connor-adams/rainbot-rainbot`        |
| **pranjeet**  | TTS worker bot                   | 3001 | `ghcr.io/connor-adams/rainbot-pranjeet`       |
| **hungerbot** | Soundboard worker bot            | 3001 | `ghcr.io/connor-adams/rainbot-hungerbot`      |
| **ui**        | Web dashboard (optional)         | 3000 | N/A (build from repo using `ui/railway.json`) |

## Deployment Options

### Option 1: Use Pre-built Images (Recommended)

Docker images are automatically built by GitHub Actions and pushed to GitHub Container Registry (GHCR).

#### Available Tags

- `latest` - Latest build from main branch
- `v1.0.0` (etc.) - Specific release versions
- `<sha>` - Specific commit SHA

#### Steps

1. **Create a Railway Project** at [railway.app](https://railway.app)

2. **Create 4 services** using "Docker Image":
   - Click **New** → **Docker Image**
   - Enter the image URL for each service:

   | Service          | Image URL                                       |
   | ---------------- | ----------------------------------------------- |
   | raincloud        | `ghcr.io/connor-adams/rainbot-raincloud:latest` |
   | rainbot-worker   | `ghcr.io/connor-adams/rainbot-rainbot:latest`   |
   | pranjeet-worker  | `ghcr.io/connor-adams/rainbot-pranjeet:latest`  |
   | hungerbot-worker | `ghcr.io/connor-adams/rainbot-hungerbot:latest` |

3. **Set environment variables** for each service (see below)

4. **Deploy!**

### Option 2: Build from Source

If you prefer Railway to build from your repo:

1. **Create 4 services** from GitHub repo
2. **Set Config Path** for each service:

   | Service          | Config Path                   |
   | ---------------- | ----------------------------- |
   | raincloud        | `apps/raincloud/railway.json` |
   | rainbot-worker   | `apps/rainbot/railway.json`   |
   | pranjeet-worker  | `apps/pranjeet/railway.json`  |
   | hungerbot-worker | `apps/hungerbot/railway.json` |

## GitHub Actions & Releases

The repository uses GitHub Actions to:

1. **Build Docker images** on every push to main
2. **Push to GHCR** with tags: `latest`, commit SHA, and release version
3. **Draft releases** automatically using Release Drafter

### Creating a Release

1. Merge PRs to main (they're automatically added to the draft release)
2. Go to **Releases** in GitHub
3. Edit the draft release, review changes, and publish
4. Or trigger manually: **Actions** → **Build and Release** → **Run workflow** → Check "Create a release"

### Release Labels

Add labels to PRs to categorize changes:

- `feature`, `enhancement` → 🚀 Features (minor version bump)
- `fix`, `bugfix`, `bug` → 🐛 Bug Fixes (patch version bump)
- `breaking`, `major` → Breaking changes (major version bump)
- `documentation`, `docs` → 📖 Documentation
- `chore`, `maintenance` → 🧰 Maintenance

## Automatic Production Deployment

When you publish a release, the workflow automatically:

1. Builds Docker images with the release version tag (e.g., `v1.0.0`)
2. Pushes images to GHCR
3. Triggers Railway webhooks to redeploy all services

### Setting Up Railway Webhooks

1. In each Railway service, go to **Settings** → **Deploy** → **Deploy Webhooks**
2. Click **Create Webhook** and copy the URL
3. Add these secrets to your GitHub repository (**Settings** → **Secrets** → **Actions**):

| Secret Name                 | Description                              |
| --------------------------- | ---------------------------------------- |
| `RAILWAY_WEBHOOK_RAINCLOUD` | Webhook URL for raincloud service        |
| `RAILWAY_WEBHOOK_RAINBOT`   | Webhook URL for rainbot-worker service   |
| `RAILWAY_WEBHOOK_PRANJEET`  | Webhook URL for pranjeet-worker service  |
| `RAILWAY_WEBHOOK_HUNGERBOT` | Webhook URL for hungerbot-worker service |

4. Create a GitHub Environment called `production` (**Settings** → **Environments**)
   - Optionally add required reviewers for extra safety

### Deployment Flow

```
PR merged to main
       ↓
Docker images built → tagged with SHA + "latest"
       ↓
Release draft updated
       ↓
[You publish the release]
       ↓
Docker images tagged with version (e.g., v1.0.0)
       ↓
Railway webhooks triggered → All 4 services redeploy
       ↓
🚀 Production updated!
```

### 3. Configure Environment Variables

#### Raincloud (Orchestrator)

```env
# Discord Bot (main bot that handles slash commands)
DISCORD_TOKEN=your_raincloud_bot_token
DISCORD_CLIENT_ID=your_raincloud_client_id
DISCORD_CLIENT_SECRET=your_raincloud_client_secret

# Session
SESSION_SECRET=your_random_session_secret

# Worker URLs (use Railway's internal networking)
RAINBOT_WORKER_URL=http://rainbot-worker.railway.internal:3001
PRANJEET_WORKER_URL=http://pranjeet-worker.railway.internal:3001
HUNGERBOT_WORKER_URL=http://hungerbot-worker.railway.internal:3001

# Optional: Database
DATABASE_URL=your_postgres_url

# Optional: Redis (for sessions)
REDIS_URL=your_redis_url

# Optional: S3 Storage
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket_name

# Optional: Allow separate UI origin (enables CORS + SameSite=None cookies)
DASHBOARD_ORIGIN=https://your-ui-domain
```

#### Rainbot Worker

```env
DISCORD_TOKEN=your_rainbot_worker_token
DISCORD_CLIENT_ID=your_rainbot_client_id
WORKER_PORT=3001
WORKER_SECRET=shared_secret_for_auth
```

#### Pranjeet Worker

```env
DISCORD_TOKEN=your_pranjeet_worker_token
DISCORD_CLIENT_ID=your_pranjeet_client_id
WORKER_PORT=3001
WORKER_SECRET=shared_secret_for_auth

# Optional: TTS providers
GOOGLE_APPLICATION_CREDENTIALS_JSON=your_google_cloud_credentials
OPENAI_API_KEY=your_openai_key
```

#### HungerBot Worker

```env
DISCORD_TOKEN=your_hungerbot_worker_token
DISCORD_CLIENT_ID=your_hungerbot_client_id
WORKER_PORT=3001
WORKER_SECRET=shared_secret_for_auth
```

#### UI Service (optional, separate deploy)

```env
# Public Raincloud URL for browser requests
VITE_API_BASE_URL=https://your-raincloud-domain/api
VITE_AUTH_BASE_URL=https://your-raincloud-domain
```

### 4. Set Up Internal Networking

Railway provides internal networking between services. Use the internal URLs:

- `http://rainbot-worker.railway.internal:3001`
- `http://pranjeet-worker.railway.internal:3001`
- `http://hungerbot-worker.railway.internal:3001`

### 5. Deploy

Once all services are configured, Railway will automatically build and deploy them.

## Discord Bot Setup

You need **4 Discord applications** (one for each bot):

1. **Raincloud** - The main bot users interact with (slash commands)
2. **Rainbot** - Worker bot for music playback
3. **Pranjeet** - Worker bot for TTS
4. **HungerBot** - Worker bot for soundboard

Each worker bot needs to be invited to your Discord server with these permissions:

- Connect
- Speak
- Use Voice Activity

Only the Raincloud bot needs slash command permissions.

## Troubleshooting

### Workers not connecting

- Verify internal URLs are correct
- Check that `WORKER_SECRET` matches between orchestrator and workers
- Ensure workers are running on port 3001

### Voice not working

- Ensure FFmpeg is installed (included in Dockerfile)
- Check worker logs for connection errors
- Verify worker bots have voice permissions in Discord

### Build failures

- Check that all package.json files are correct
- Verify yarn.lock is up to date
- Check build logs for TypeScript errors
