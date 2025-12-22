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
5. **Note**: The `nixpacks.toml` file ensures Python 3 and FFmpeg are installed for `youtube-dl-exec` to work properly

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
- `PORT` - Railway sets this automatically (don't set manually)
- `HOST` - Railway sets this automatically (don't set manually)
- `SESSION_STORE_PATH` - Path for session files (default: `./sessions`)

### 4. Configure Discord OAuth

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to OAuth2 → Redirects
4. Add your Railway public domain callback URL:
   - Railway will provide a public domain like `your-app.up.railway.app`
   - Add: `https://your-app.up.railway.app/auth/discord/callback`
   - Or use your custom domain if configured

### 5. Deploy

Railway will automatically:
- Install dependencies (`npm install`)
- Start your app (`npm start`)
- **Auto-deploy Discord commands** (no need to run `deploy-commands.js` manually!)
- Provide a public URL for your dashboard

**Note**: Commands are automatically deployed when the bot starts. If you set `DISCORD_GUILD_ID`, commands deploy to that guild (faster, updates immediately). Otherwise, commands deploy globally (takes up to 1 hour to propagate).

### 6. Get Your Public URL

1. In Railway project, go to "Settings"
2. Under "Networking", you'll see your public domain
3. Copy this URL and add it to Discord OAuth redirects (step 4)

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
| `SESSION_STORE_PATH` | Path for session files | No |

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

### Sessions not persisting
- Sessions are stored in files by default
- On Railway, sessions persist across restarts
- For production, consider using Redis (Railway has Redis addon)

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

