# syntax=docker/dockerfile:1.7
# Build context is the REPO ROOT — see .github/workflows/build-images.yml.
# This image carries ONLY raincloud and the @rainbot/* packages it depends on,
# so its content hash (scripts/service-content-hash.cjs) moves independently of
# the other three bots. The root Dockerfile stays as-is for docker-compose,
# which still builds one unified image for all four.

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

RUN yarn install --immutable

COPY packages/ ./packages/
COPY apps/raincloud/ ./apps/raincloud/

# `--filter=<pkg>...` builds this app plus the @rainbot/* packages it depends
# on. A bare `yarn build:ts` would also try to build the other three apps, whose
# source is deliberately absent from this context.
RUN yarn turbo run build --filter=@rainbot/raincloud...

FROM node:22-slim AS runner
WORKDIR /app

# ffmpeg: server/routes/api.ts trimToOggOpus spawns it directly, and
# @rainbot/utils storage/sounds/voice all shell out to it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip ca-certificates \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp goes stale fast — YouTube breaks extraction within weeks of a release.
# Under content-hash image builds this layer is NOT rebuilt by ordinary commits,
# so build-images.yml runs a weekly scheduled force-rebuild that re-pushes the
# same :tree-<hash> tag with a fresh yt-dlp. If that schedule is ever removed,
# this binary silently rots.
# yt-dlp-ejs is the JS extraction component; without it, plus a JS runtime,
# yt-dlp reports YouTube extraction as deprecated and loses formats. The runtime
# is this image's own node, selected per-call with --js-runtimes.
# No PO token provider here on purpose — see docs/YOUTUBE_403_FIX.md and the
# measurement note in the root Dockerfile.
RUN pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp yt-dlp-ejs

ENV NODE_ENV=production

# node_modules carries relative workspace symlinks into ./packages and ./apps,
# so the runner must reproduce the builder's /app layout exactly. The other
# three apps' symlinks dangle here by design — nothing resolves them.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/raincloud ./apps/raincloud
COPY --from=builder /app/package.json /app/yarn.lock /app/.yarnrc.yml ./

# index.js monkeypatches Module._resolveFilename to map @server/@handlers/... to
# dist/apps/raincloud/..., which only resolves when cwd is the repo root.
CMD ["node", "apps/raincloud/index.js"]
