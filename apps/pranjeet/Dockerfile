# syntax=docker/dockerfile:1.7
# Build context is the REPO ROOT — see .github/workflows/build-images.yml.
# This image carries ONLY the pranjeet worker and the @rainbot/* packages it
# depends on, so its content hash (scripts/service-content-hash.cjs) moves
# independently of the other three bots. The root Dockerfile stays as-is for
# docker-compose, which still builds one unified image for all four.

FROM node:22-slim AS builder
WORKDIR /app

# @discordjs/opus is node-pre-gyp: it downloads a prebuild when one matches the
# platform and otherwise compiles via node-gyp, which needs python3 and a C++
# toolchain. .yarnrc.yml sets enableScripts: true, so that script does run.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 build-essential g++ make ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Manifests before source so the install layer survives source-only changes.
# EVERY workspace manifest is copied, not just this app's: `yarn install
# --immutable` resolves the whole workspace graph from the lockfile and fails on
# a missing workspace. service-content-hash.cjs hashes the same set.
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
COPY apps/pranjeet/ ./apps/pranjeet/

# `--filter=<pkg>...` builds this app plus the @rainbot/* packages it depends
# on. A bare `yarn build:ts` would also try to build the other three apps, whose
# source is deliberately absent from this context.
RUN yarn turbo run build --filter=@rainbot/pranjeet-worker...

FROM node:22-slim AS runner
WORKDIR /app

# ffmpeg: @rainbot/utils voiceInteractionManager execs an ffmpeg command to turn
# raw s16le PCM into wav, and ttsPlayer plays files via StreamType.Arbitrary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# No yt-dlp here: pranjeet imports only @rainbot/utils/voice/ttsPlayer and
# .../voiceInteractionInstance, neither of which reaches trackFetcher or
# voice/audioResource — the only youtube-dl-exec call sites. Only raincloud and
# rainbot need the binary.

ENV NODE_ENV=production

# node_modules carries relative workspace symlinks into ./packages and ./apps,
# so the runner must reproduce the builder's /app layout exactly. The other
# three apps' symlinks dangle here by design — nothing resolves them.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/pranjeet ./apps/pranjeet
COPY --from=builder /app/package.json /app/yarn.lock /app/.yarnrc.yml ./

# pranjeet's tsconfig sets rootDir to the monorepo root so it can compile
# packages/*/src through path aliases, so tsc output mirrors the repo tree.
# The entrypoint is nested, NOT dist/index.js (the root Dockerfile's header
# comment gets this wrong).
CMD ["node", "apps/pranjeet/dist/apps/pranjeet/src/index.js"]
