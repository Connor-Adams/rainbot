# Discord OAuth Setup Guide

This guide walks you through setting up Discord OAuth for the web dashboard authentication.

## Overview

The dashboard uses Discord OAuth2 to authenticate users. Users must:
1. Be a member of at least one server where your bot is present
2. Have a specific role in that server

## Step-by-Step Setup

### 1. Get Your Bot's Client ID

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application (or create a new one)
3. Go to **General Information**
4. Copy the **Application ID** (this is your `DISCORD_CLIENT_ID`)

### 2. Create OAuth2 Credentials

1. In the same application, go to **OAuth2** → **General**
2. Under **Client Secret**, click **Reset Secret** (if you don't have one)
3. **Copy the Client Secret** - you'll need this for `DISCORD_CLIENT_SECRET`
   - ⚠️ **Important**: This is only shown once! Save it immediately.

### 3. Configure OAuth2 Redirect URLs

1. Still in **OAuth2** → **General**
2. Scroll down to **Redirects**
3. Click **Add Redirect**
4. Add your callback URLs:

   **For Local Development:**
   ```
   http://localhost:3000/auth/discord/callback
   ```

   **For Railway Deployment:**
   ```
   https://rainbot-production.up.railway.app/auth/discord/callback
   ```
   (This is the callback URL for the production deployment)

   **For Custom Domain:**
   ```
   https://yourdomain.com/auth/discord/callback
   ```

5. Click **Save Changes**

### 4. Required OAuth2 Scopes

The application uses these scopes (already configured in code):
- `identify` - Get user's basic information (username, avatar, etc.)
- `guilds` - Get list of servers user is in (for verification)

These are automatically requested - you don't need to configure them manually.

### 5. Get the Required Role ID

You need to create or identify a Discord role that users must have to access the dashboard:

1. In your Discord server, go to **Server Settings** → **Roles**
2. Create a new role (e.g., "Dashboard Access") or use an existing one
3. Right-click the role → **Copy ID** (you need Developer Mode enabled)
   - Enable Developer Mode: User Settings → Advanced → Developer Mode
4. This is your `REQUIRED_ROLE_ID`

### 6. Set Environment Variables

Set these in Railway (or your `.env` file for local development):

**Required:**
```bash
DISCORD_CLIENT_ID=your_application_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
REQUIRED_ROLE_ID=your_role_id_here
```

**Optional:**
```bash
CALLBACK_URL=https://rainbot-production.up.railway.app/auth/discord/callback
# (Auto-detected on Railway, but you can set it manually)
```

### 7. Verify Bot Permissions

Make sure your bot has these permissions in servers where users need access:
- **View Channels** - To see the server
- **Manage Roles** - To check if users have the required role
- **Read Member List** - To verify user membership

## How It Works

1. **User clicks "Login with Discord"** → Redirected to Discord OAuth
2. **User authorizes** → Discord redirects back with authorization code
3. **Server exchanges code** → Gets access token from Discord
4. **Server fetches user info** → Gets user profile and guild list
5. **Server verifies role** → Checks if user has required role in any bot server
6. **Access granted/denied** → User is logged in or shown error

## Testing

### Local Testing

1. Set up `.env` file with your credentials
2. Start the bot: `npm start`
3. Visit `http://localhost:3000`
4. Click "Login with Discord"
5. Authorize the application
6. You should be redirected back and logged in (if you have the required role)

### Railway Testing

1. Deploy to Railway with all environment variables set
2. Add the callback URL to Discord OAuth redirects: `https://rainbot-production.up.railway.app/auth/discord/callback`
3. Visit your Railway URL: [https://rainbot-production.up.railway.app/](https://rainbot-production.up.railway.app/)
4. Click "Login with Discord"
5. Authorize the application
6. You should be redirected back and logged in (if you have the required role)

## Troubleshooting

### "Access Denied" Error

- **User doesn't have the role**: Make sure the user has the role specified in `REQUIRED_ROLE_ID`
- **Bot not in server**: The bot must be in the server where the user has the role
- **Role ID incorrect**: Double-check the `REQUIRED_ROLE_ID` matches the actual role ID

### "Invalid Redirect URI" Error

- **Callback URL mismatch**: The callback URL in Discord must exactly match your deployment URL
- **Missing protocol**: Make sure URLs start with `http://` or `https://`
- **Trailing slash**: Don't add trailing slashes to callback URLs

### "Bot is not ready" Error

- **Bot not started**: Make sure the Discord bot is running and connected
- **Bot not in server**: The bot must be in servers where users need access

### OAuth Flow Not Starting

- **Client ID/Secret incorrect**: Verify `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are correct
- **Redirect URL not added**: Make sure the callback URL is added in Discord Developer Portal

## Security Notes

- **Never commit** `DISCORD_CLIENT_SECRET` or `SESSION_SECRET` to git
- Use strong, random `SESSION_SECRET` (generate with: `openssl rand -hex 32`)
- Keep your Client Secret secure - if compromised, reset it immediately
- Use HTTPS in production (Railway provides this automatically)

## Quick Reference

| Setting | Where to Find |
|---------|---------------|
| `DISCORD_CLIENT_ID` | Developer Portal → General Information → Application ID |
| `DISCORD_CLIENT_SECRET` | Developer Portal → OAuth2 → Client Secret |
| `REQUIRED_ROLE_ID` | Discord Server → Right-click role → Copy ID (Developer Mode) |
| Callback URL | `https://your-domain.com/auth/discord/callback` |

## Example Configuration

**Railway Environment Variables:**
```
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz123456
REQUIRED_ROLE_ID=987654321098765432
SESSION_SECRET=your_random_secret_here
```

**Discord OAuth Redirects:**
```
https://rainbot-production.up.railway.app/auth/discord/callback
http://localhost:3000/auth/discord/callback
```

**Production Dashboard URL:**
- Dashboard: [https://rainbot-production.up.railway.app/](https://rainbot-production.up.railway.app/)
- OAuth Callback: `https://rainbot-production.up.railway.app/auth/discord/callback`

That's it! Once configured, users can authenticate with Discord and access the dashboard if they have the required role.

