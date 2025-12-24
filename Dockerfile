# Use Railway's Node.js base image (Railpack compatible)
FROM node:22-slim

# Install system dependencies required for native modules and yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    # Build tools for native Node.js modules (@discordjs/opus)
    build-essential \
    g++ \
    make \
    libtool \
    autoconf \
    automake && \
    # Install yt-dlp via pip (--break-system-packages needed for Python 3.11+ PEP 668)
    pip3 install --no-cache-dir --break-system-packages yt-dlp && \
    # Clean up apt cache
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (including devDependencies for TypeScript compilation)
# Skip youtube-dl-exec binary download - we use system yt-dlp
RUN YOUTUBE_DL_SKIP_DOWNLOAD=true npm ci

# Copy application code
COPY . .

# Compile TypeScript during build
RUN npm run build:ts

# Deploy Discord commands during build (if env vars are available)
RUN node utils/deployCommands.js || echo "Command deployment skipped (env vars not available during build)"

# Build React UI
WORKDIR /app/ui
COPY ui/package*.json ./
# Install all dependencies (including devDependencies) to build
RUN npm ci
COPY ui/ ./
RUN npm run build

# Return to app root
WORKDIR /app

# Remove devDependencies to reduce image size (optional)
RUN npm prune --production

# Expose port (Railway sets PORT env var)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

