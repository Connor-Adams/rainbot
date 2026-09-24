# syntax=docker/dockerfile:1.7
# Build context is the REPO ROOT — see .github/workflows/build-images.yml.
# The dashboard is a standalone static site: no bot serves it (raincloud's
# express 404s unmatched routes), so it ships as its own image behind nginx.

FROM node:22-slim AS builder
WORKDIR /app

# A static site needs no C++ toolchain, but `yarn install --immutable` installs
# the WHOLE workspace graph — including the bots' @discordjs/opus, which is
# node-pre-gyp and compiles via node-gyp whenever no prebuild matches the
# platform. It matched on arm64 and did not on the amd64 CI runner, so leaving
# this out built fine locally and failed in Actions.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 build-essential g++ make ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# youtube-dl-exec's postinstall downloads a yt-dlp binary from GitHub releases.
# These images do not use it — yt-dlp comes from pip, and youtube-dl-exec only
# shells out to whatever `yt-dlp` is on PATH — so the download is pure waste and
# a flake source (it has already failed a build). CI's setup action skips it for
# the same reason; this brings the images in line.
ENV YOUTUBE_DL_SKIP_DOWNLOAD=true

# Manifests before source so the install layer survives source-only changes.
# EVERY workspace manifest is copied, not just ui's: `yarn install --immutable`
# resolves the whole workspace graph from the lockfile and fails on a missing
# workspace. service-content-hash.cjs hashes the same set.
COPY package.json yarn.lock .yarnrc.yml turbo.json tsconfig.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/observability/package.json ./packages/observability/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/redis-client/package.json ./packages/redis-client/
COPY packages/rpc/package.json ./packages/rpc/
COPY packages/shared/package.json ./packages/shared/
COPY packages/utils/package.json ./packages/utils/
COPY packages/worker-protocol/package.json ./packages/worker-protocol/
COPY packages/worker-shared/package.json ./packages/worker-shared/
COPY apps/raincloud/package.json ./apps/raincloud/
COPY apps/rainbot/package.json ./apps/rainbot/
COPY apps/pranjeet/package.json ./apps/pranjeet/
COPY apps/hungerbot/package.json ./apps/hungerbot/
COPY ui/package.json ./ui/

# node_auth_token authenticates @connor-adams/* (the shared design system,
# published to GitHub Packages) during install. Mounted as a BuildKit secret so
# it never lands in an image layer; .yarnrc.yml reads it via ${NODE_AUTH_TOKEN:-}.
# CI passes secrets.GITHUB_TOKEN, which can read packages in this org.
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token 2>/dev/null || true)" \
    yarn install --immutable

COPY packages/ ./packages/
COPY ui/ ./ui/

# `--filter=@rainbot/ui...` also builds @rainbot/protocol and @rainbot/shared —
# the latter needs its ESM output, which its own build script produces.
# Nothing here reads VITE_* at build time: the API/auth origins arrive at
# container start via runtime-config.js, so one image works in every
# environment.
RUN yarn turbo run build --filter=@rainbot/ui...

# nginx-unprivileged runs master and workers as uid 101 and ships writable
# temp/pid dirs for that user. It still runs the official nginx entrypoint, so
# envsubst over /etc/nginx/templates/*.template and the /docker-entrypoint.d
# hooks both work unchanged.
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Non-root nginx cannot bind privileged ports (<1024). Overridable — the
# listen directive is substituted from this at start.
ENV PORT=8080

# --chown to the nginx uid so 30-runtime-config.sh can rewrite
# runtime-config.js in place at boot without root.
COPY --from=builder --chown=101:101 /app/ui/dist /usr/share/nginx/html
COPY ui/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=0755 ui/30-runtime-config.sh /docker-entrypoint.d/30-runtime-config.sh

EXPOSE 8080
