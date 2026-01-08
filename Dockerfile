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
    pip3 install --no-cache-dir --break-system-packages yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies (native modules compile here)
RUN yarn install --immutable

# Build all TypeScript
RUN yarn build:ts

# Build UI (for Raincloud dashboard)
RUN yarn workspace @rainbot/ui build

ENV NODE_ENV=production

# Default to raincloud, override with CMD in deployment
CMD ["node", "apps/raincloud/index.js"]
