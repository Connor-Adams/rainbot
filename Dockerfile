# Use Railway's Node.js base image (Railpack compatible)
FROM node:22-slim

# Install system dependencies required for yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates && \
    # Install yt-dlp via pip
    pip3 install --no-cache-dir yt-dlp && \
    # Clean up apt cache
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
# Skip youtube-dl-exec binary download - we use system yt-dlp
RUN YOUTUBE_DL_SKIP_DOWNLOAD=true npm ci --only=production

# Copy application code
COPY . .

# Expose port (Railway sets PORT env var)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

