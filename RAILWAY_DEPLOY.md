# Railway Deployment Guide

Railway is perfect for deploying both your Discord bot and web dashboard together! It's as easy as Vercel but supports long-running processes.

## Quick Start

### 1. Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended for easy deployment)

### 2. Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your `rainbot` repository
4. Railway will automatically detect it's a Node.js project
5. **Note**: The `Dockerfile` ensures Python 3, FFmpeg, and yt-dlp are installed for `youtube-dl-exec` to work properly

### 3. Set Environment Variables

In your Railway project settings, go to "Variables" and add:

**Required:**
- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `DISCORD_CLIENT_ID` - Your Discord bot's Client ID  
- `DISCORD_CLIENT_SECRET` - Your Discord OAuth Client Secret
- `SESSION_SECRET` - A random secret string for session encryption (generate a secure random string)
- `REQUIRED_ROLE_ID` - The Discord role ID users must have to access the dashboard

**Optional:**
- `DISCORD_GUILD_ID` - Guild ID for faster command deployment (deploys to specific guild instead of globally)
- `DISABLE_AUTO_DEPLOY` - Set to `true` to disable automatic command deployment on startup
- `CALLBACK_URL` - OAuth callback URL (auto-detected from Railway domain, but you can set manually: `https://rainbot-production.up.railway.app/auth/discord/callback`)
- `RAILWAY_PUBLIC_DOMAIN` - Railway public domain (usually auto-set, but if not: `rainbot-production.up.railway.app`)
- `PORT` - Railway sets this automatically (don't set manually)
- `HOST` - Railway sets this automatically (don't set manually)
- `REDIS_URL` - Redis connection URL (auto-set when Redis addon is added, see below)
- `SESSION_STORE_PATH` - Path for session files (default: `./sessions`, only used if Redis is not available)

### 4. Add Redis for Persistent Sessions (Recommended)

**Why Redis?** Sessions stored in files are lost on every deployment. Redis ensures you stay logged in across deployments!

1. In your Railway project, click **"+ New"** → **"Database"** → **"Add Redis"**
2. Railway will automatically create a Redis instance and set the `REDIS_URL` environment variable
3. The app will automatically detect and use Redis for session storage
4. **That's it!** No additional configuration needed - sessions will now persist across deployments

**Note:** If Redis is not available, the app will automatically fall back to file-based sessions (which don't persist across deployments).

### 5. Configure Discord OAuth

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to OAuth2 → Redirects
4. Add your Railway public domain callback URL:
   - **Production URL**: `https://rainbot-production.up.railway.app/auth/discord/callback`
   - Add this exact URL to Discord OAuth redirects
   - Also add local development URL: `http://localhost:3000/auth/discord/callback`
   - Or use your custom domain if configured

### 6. Deploy

Railway will automatically:
- Build the Docker image (installs Python3, FFmpeg, yt-dlp, and Node.js dependencies)
- Start your app (`npm start`)
- **Auto-deploy Discord commands** (no need to run `deploy-commands.js` manually!)
- Provide a public URL for your dashboard

**Note**: 
- The build uses a Dockerfile to install system dependencies (Python3, FFmpeg, yt-dlp) required for YouTube audio extraction
- Commands are automatically deployed when the bot starts. If you set `DISCORD_GUILD_ID`, commands deploy to that guild (faster, updates immediately). Otherwise, commands deploy globally (takes up to 1 hour to propagate).

### 7. Get Your Public URL

**Production Dashboard URL:** [https://rainbot-production.up.railway.app/](https://rainbot-production.up.railway.app/)

1. In Railway project, go to "Settings"
2. Under "Networking", you'll see your public domain
3. Copy this URL and add it to Discord OAuth redirects (step 4)
4. **Callback URL**: `https://rainbot-production.up.railway.app/auth/discord/callback`

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal | Yes |
| `DISCORD_CLIENT_ID` | Bot Client ID | Yes |
| `DISCORD_CLIENT_SECRET` | OAuth Client Secret | Yes |
| `SESSION_SECRET` | Random secret for sessions | Yes |
| `REQUIRED_ROLE_ID` | Discord role ID for dashboard access | Yes |
| `DISCORD_GUILD_ID` | Guild ID for faster command deployment (optional) | No |
| `DISABLE_AUTO_DEPLOY` | Set to `true` to disable auto-deploy (optional) | No |
| `CALLBACK_URL` | OAuth callback URL (auto-detected if not set) | No |
| `REDIS_URL` | Redis connection URL (auto-set when Redis addon is added) | No |
| `SESSION_STORE_PATH` | Path for session files (fallback if Redis not available) | No |

## Generating Session Secret

Generate a secure random string for `SESSION_SECRET`:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using openssl
openssl rand -hex 32
```

## Custom Domain (Optional)

1. In Railway project → Settings → Networking
2. Click "Generate Domain" or add your custom domain
3. Update Discord OAuth redirect URL to match

## Monitoring

Railway provides:
- **Logs**: View real-time logs in the Railway dashboard
- **Metrics**: CPU, Memory, Network usage
- **Deployments**: View deployment history

## Troubleshooting

### Bot not connecting
- Check `DISCORD_BOT_TOKEN` is set correctly
- Check logs in Railway dashboard for errors

### OAuth not working
- Verify `CALLBACK_URL` matches your Railway public domain
- Check Discord OAuth redirect URL is correct
- Ensure `DISCORD_CLIENT_SECRET` is set

### Sessions not persisting across deployments
- **Solution:** Add Redis addon to your Railway project (see step 4)
- Redis sessions persist across deployments, file-based sessions do not
- The app automatically detects Redis and uses it if available
- Check logs for "Using Redis for session storage" to confirm Redis is active

## Cost

- **Free Tier**: $5 credit/month (usually enough for small bots)
- **Hobby Plan**: $5/month for more resources
- **Pro Plan**: $20/month for production workloads

## Advantages Over Vercel

✅ Supports long-running processes (Discord bot)  
✅ Both bot and dashboard run together  
✅ Persistent file storage (sessions)  
✅ Easy environment variable management  
✅ Automatic HTTPS  
✅ GitHub integration  
✅ Supports multiple languages (Node.js + Python for yt-dlp)  

## Local Development

The code works locally too! Just use `config.json`:

```bash
# Install dependencies
npm install

# Run locally
npm start
```

The code automatically detects Railway vs local environment and uses appropriate settings.

