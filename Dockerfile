# =============================================================================
# Rainbot Unified Image - All 4 bots in one image
# =============================================================================
# Deploy this image 4 times with different CMD:
#   - Raincloud:  node apps/raincloud/index.js
#   - Rainbot:    node apps/rainbot/dist/index.js
#   - Pranjeet:   node apps/pranjeet/dist/index.js
#   - HungerBot:  node apps/hungerbot/dist/index.js
# =============================================================================

FROM node:22-slim

# Install ALL dependencies (build tools + runtime)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    g++ \
    make \
    ffmpeg \
    curl \
    ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy everything
COPY . .

# yt-dlp goes stale fast — YouTube breaks extraction within weeks of a release.
# This must stay AFTER the COPY so the layer is invalidated by every commit;
# in the apt layer above it was cached indefinitely and prod ran a build-day
# binary for months.
# yt-dlp-ejs is the JS extraction component; without it, plus a JS runtime,
# yt-dlp reports YouTube extraction as deprecated and loses formats. The runtime
# is the image's own node, selected per-call with --js-runtimes.
# No PO token provider here on purpose. One was tried and measured: with the
# outbound proxy in place, a full 3.8MB audio download succeeded while the
# provider was deliberately pointed at a dead port, because yt-dlp selects the
# visionos client, which carries no PO token requirement. Installing the plugin
# without a reachable server also makes yt-dlp warn on every single call, and
# warnings that are always present are warnings nobody reads. See
# docs/YOUTUBE_403_FIX.md if the situation changes.
RUN pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp yt-dlp-ejs

# Install dependencies (native modules compile here)
RUN yarn install --immutable

# Build all TypeScript
RUN yarn build:ts

# Build UI (for Raincloud dashboard)
RUN yarn workspace @rainbot/ui build

ENV NODE_ENV=production

# Default to raincloud, override with CMD in deployment
CMD ["node", "apps/raincloud/index.js"]
