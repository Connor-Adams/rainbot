# Deployment Guide (Dokploy)

Production runs on [Dokploy](https://dokploy.com). Logs are in Loki, viewed through Grafana at
[grafana.rainbot.win](https://grafana.rainbot.win).

## Layout

One Dokploy project, **Rainbot**, holding five **Application**s (Docker-image apps, not a compose
stack). Each pulls its image's `:prod` tag from GHCR:

| Application | Image                                         | Port | Public domain      |
| ----------- | --------------------------------------------- | ---- | ------------------ |
| raincloud   | `ghcr.io/connor-adams/rainbot-raincloud:prod` | 3000 | `api.rainbot.win`  |
| rainbot     | `ghcr.io/connor-adams/rainbot-rainbot:prod`   | 3001 | —                  |
| pranjeet    | `ghcr.io/connor-adams/rainbot-pranjeet:prod`  | 3002 | —                  |
| hungerbot   | `ghcr.io/connor-adams/rainbot-hungerbot:prod` | 3003 | —                  |
| ui          | `ghcr.io/connor-adams/rainbot-ui:prod`        | 8080 | `dash.rainbot.win` |

Redis and Postgres are Dokploy database services in the same project.

**Ingress:** TLS terminates at a Cloudflare tunnel (`cloudflared`), which forwards plain HTTP to
Dokploy's Traefik, which routes by host to `raincloud` or `ui`. The workers have no public
domain — only Raincloud talks to them.

**Internal DNS:** applications reach each other by their Dokploy-generated **appName** (shown in
the application's settings; it carries a random suffix), always with an explicit port:

```env
# raincloud
RAINBOT_URL=http://<rainbot-app-name>:3001
PRANJEET_URL=http://<pranjeet-app-name>:3002
HUNGERBOT_URL=http://<hungerbot-app-name>:3003

# each worker
RAINCLOUD_URL=http://<raincloud-app-name>:3000
```

The `ui` image is nginx serving the built dashboard. It reads no `VITE_*` at build time;
`ui/30-runtime-config.sh` rewrites `runtime-config.js` from `VITE_API_BASE_URL` /
`VITE_AUTH_BASE_URL` / `VITE_DEBUG_LOGS` on every container start, so set those as runtime env on
the `ui` application (pointing at `https://api.rainbot.win`).

## Release flow

Merging to `main` does **not** deploy anything.

1. **Merge to `main`** → `build-images.yml` builds any service whose content hash changed and
   pushes `:tree-<contenthash>` (plus `:sha-<commit>` / `:main` for traceability).
2. **Release Drafter** keeps a _draft_ release up to date. A draft deploys nothing.
3. **Publish the GitHub Release** →
   - `release-promote.yml` re-tags each service's existing `:tree-<hash>` image as `:<tag>` and
     `:prod`. No rebuild: `:prod` is byte-identical to what CI built.
   - `release-deploy.yml` waits for promotion, then calls the Dokploy API
     (`.github/actions/dokploy-deploy`) to redeploy the services that changed since the previous
     release: **raincloud first** (gated on `/health/ready`), then the three workers. `ui` deploys
     alongside, independently.

Required repo secrets: `DOKPLOY_URL`, `DOKPLOY_API_KEY`, and `DOKPLOY_APP_ID_RAINCLOUD` /
`_RAINBOT` / `_PRANJEET` / `_HUNGERBOT` / `_UI`. Optional: `RAINCLOUD_HEALTH_URL`. See
[.github/workflows/README.md](.github/workflows/README.md) for the details.

## Environment variables

Set these per application in Dokploy (Application → Environment). See
[.env.example](.env.example) for the full list with comments.

### Raincloud

| Variable                                                                                                     | Description                                                                                    | Required                        |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| `RAINCLOUD_TOKEN`                                                                                            | Raincloud's Discord bot token (`DISCORD_BOT_TOKEN` is accepted as a legacy fallback)           | Yes                             |
| `DISCORD_CLIENT_ID`                                                                                          | Raincloud's application ID                                                                     | Yes                             |
| `DISCORD_CLIENT_SECRET`                                                                                      | OAuth client secret                                                                            | Yes                             |
| `SESSION_SECRET`                                                                                             | Random secret for sessions. **Must stay the same across deploys**, or every user is logged out | Yes                             |
| `WORKER_SECRET`                                                                                              | Shared secret for orchestrator ↔ worker calls; same value on every application                 | Yes                             |
| `RAINBOT_URL` etc.                                                                                           | Worker URLs (see [Layout](#layout))                                                            | Yes                             |
| `REDIS_URL`                                                                                                  | Redis connection URL from the Dokploy Redis service                                            | Yes                             |
| `DATABASE_URL`                                                                                               | Postgres connection URL from the Dokploy Postgres service                                      | No (required for statistics)    |
| `CALLBACK_URL`                                                                                               | OAuth callback: `https://api.rainbot.win/auth/discord/callback`                                | Yes in production               |
| `DASHBOARD_ORIGIN`                                                                                           | UI origin for CORS and post-login redirect: `https://dash.rainbot.win`                         | Yes in production               |
| `NODE_ENV`                                                                                                   | `production`                                                                                   | Yes                             |
| `REQUIRED_ROLE_ID`                                                                                           | Discord role a user needs for dashboard access                                                 | No                              |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`, `AWS_S3_BUCKET_NAME`, `AWS_DEFAULT_REGION` | S3-compatible storage for sounds                                                               | No                              |
| `DISCORD_GUILD_ID`                                                                                           | Deploy slash commands to one guild (instant) instead of globally (up to an hour)               | No                              |
| `DISABLE_AUTO_DEPLOY`                                                                                        | `true` to skip slash-command deployment on startup                                             | No                              |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`                                                                 | Spotify URL support                                                                            | No (required for Spotify links) |

### Workers (rainbot, pranjeet, hungerbot)

| Variable                                               | Description                                                                                                                                                              | Required |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `RAINBOT_TOKEN` / `PRANJEET_TOKEN` / `HUNGERBOT_TOKEN` | That worker's own Discord bot token (each worker is a separate Discord application)                                                                                      | Yes      |
| `RAINCLOUD_URL`                                        | `http://<raincloud-app-name>:3000`                                                                                                                                       | Yes      |
| `WORKER_SECRET`                                        | Same value as on Raincloud                                                                                                                                               | Yes      |
| `ORCHESTRATOR_BOT_ID`                                  | Raincloud's Discord user ID, for auto-follow into voice                                                                                                                  | Yes      |
| `VOICE_TRIGGER_WORD`                                   | (Pranjeet) Wake word an utterance must START with to get a reply (e.g. "hey bot"). **Unset defaults to `evan`, so unset means gated, not open** — the gate fails closed. | No       |

## Discord setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create one
   application per bot (Raincloud, Rainbot, Pranjeet, Hungerbot) and copy each bot token.
2. On the Raincloud application, go to **OAuth2 → Redirects** and add:
   - `https://api.rainbot.win/auth/discord/callback` (production)
   - `http://localhost:5173/auth/discord/callback` (local dev, UI on Vite)
3. See [OAUTH_SETUP.md](OAUTH_SETUP.md) for the role and scope setup.

Slash commands deploy automatically when Raincloud starts (unless `DISABLE_AUTO_DEPLOY=true`).

## Generating the session secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

Set it once on Raincloud and never change it unless you mean to log everyone out. Sessions live in
Redis, so they survive redeploys as long as `SESSION_SECRET` is stable.

## Troubleshooting

### Login never redirects to Discord / returns to the wrong place

- `CALLBACK_URL` on Raincloud must be `https://api.rainbot.win/auth/discord/callback`, never
  `localhost`, and must exactly match a redirect in the Discord portal.
- The UI's `VITE_AUTH_BASE_URL` must point at Raincloud (`https://api.rainbot.win`), so "Login
  with Discord" hits the API, not the nginx container.
- `DASHBOARD_ORIGIN` on Raincloud must be `https://dash.rainbot.win` for CORS and the post-login
  redirect.

### Worker registration "fetch failed" / stats report failed

Workers call Raincloud at `RAINCLOUD_URL`. Use the Raincloud **appName** with the port
(`http://<raincloud-app-name>:3000`), not the public domain or the Dokploy display name. Workers
give up after four failed registrations, so restart them once Raincloud is healthy.

### Commands reply "rainbot not ready" (or pranjeet/hungerbot)

Raincloud's RPC health check to that worker is failing; the reply includes the reason. Check that
`RAINBOT_URL` / `PRANJEET_URL` / `HUNGERBOT_URL` use the worker appNames with explicit ports, and
that `WORKER_SECRET` matches everywhere (`Unauthorized` means it does not).

### Bot not connecting

Check the bot token on that application, then its logs in Grafana (`service_name` label
`rainbot-raincloud`, `rainbot-rainbot`, `rainbot-pranjeet`, or `rainbot-hungerbot`).

## Local development

```bash
yarn
cp .env.example .env   # fill in credentials
yarn dev               # all bots + UI
```

See [README.md](README.md) for per-workspace commands.
