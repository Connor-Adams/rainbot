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
# bgutil-ytdlp-pot-provider supplies YouTube proof-of-origin tokens, which is
# what a datacenter IP needs to get past "Sign in to confirm you're not a bot"
# without an account. pip installs the PLUGIN only: its script providers report
# "unavailable" because they look for a checked-out server build under
# ~/bgutil-ytdlp-pot-provider that pip does not ship. Only the http provider
# works, so a provider server must be running and BGUTIL_POT_BASE_URL must point
# at it; run the brainicism/bgutil-ytdlp-pot-provider image at the tag matching
# this plugin's version. Without it yt-dlp only warns and carries on.
RUN pip3 install --no-cache-dir --break-system-packages --upgrade \
    yt-dlp yt-dlp-ejs bgutil-ytdlp-pot-provider

# Install dependencies (native modules compile here)
RUN yarn install --immutable

# Build all TypeScript
RUN yarn build:ts

# Build UI (for Raincloud dashboard)
RUN yarn workspace @rainbot/ui build

ENV NODE_ENV=production

# Default to raincloud, override with CMD in deployment
CMD ["node", "apps/raincloud/index.js"]
