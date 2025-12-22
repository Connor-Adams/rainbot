# OAuth Login Troubleshooting Guide

If OAuth redirects back but doesn't log you in, follow these steps:

## Quick Debug Steps

### 1. Check Railway Logs

After attempting to log in, check your Railway logs for:

**Success indicators:**
```
[AUTH_ROUTES] OAuth callback received
[AUTH_ROUTES] OAuth access granted for user YourUsername (123456789)
[AUTH_ROUTES] User YourUsername logged in successfully
```

**Failure indicators:**
```
[AUTH_ROUTES] OAuth access denied for user... - missing required role
[AUTH_ROUTES] Bot client not ready during OAuth verification
[ROLE_VERIFIER] User does not have required role in any bot guild
```

### 2. Check Debug Endpoint

Visit: `https://rainbot-production.up.railway.app/auth/debug`

This will show:
- Authentication status
- User info
- Session data
- Headers

### 3. Check Browser Console

Open browser DevTools (F12) → Console tab, and look for:
- Auth check responses
- Any errors
- Session cookie issues

## Common Issues & Solutions

### Issue: "Bot is not ready"

**Symptoms:**
- Logs show "Bot client not ready during OAuth verification"
- OAuth redirects but login fails

**Solutions:**
1. Check if bot is actually running and connected to Discord
2. Check Railway logs for bot connection errors
3. Verify `DISCORD_BOT_TOKEN` is set correctly
4. Wait a few seconds after bot starts before trying to log in

### Issue: Role Verification Failing

**Symptoms:**
- Logs show "missing required role"
- User has the role but still can't access

**Check:**
1. **Role ID is correct:**
   - Right-click role → Copy ID (with Developer Mode enabled)
   - Verify `REQUIRED_ROLE_ID` matches exactly
   
2. **Bot is in the server:**
   - Bot must be in the same server where user has the role
   - Check logs: "Bot is in X guild(s)"
   
3. **User has the role:**
   - User must have the exact role ID specified
   - Role name doesn't matter - only the ID
   
4. **Bot has permissions:**
   - Bot needs "View Channels"
   - Bot needs "Manage Roles" (to check roles)
   - Bot needs "Read Member List"

### Issue: Session Not Persisting

**Symptoms:**
- Login appears successful but immediately shows login screen again
- Session cookie not being set

**Check:**
1. **Cookie settings:**
   - Railway uses HTTPS, so `secure: true` is correct
   - Check browser DevTools → Application → Cookies
   - Look for `rainbot.sid` cookie
   
2. **Session store:**
   - Sessions stored in `./sessions/` directory
   - Check if directory exists and is writable
   
3. **SameSite cookie issues:**
   - If using custom domain, ensure it matches exactly
   - Check browser console for cookie warnings

### Issue: OAuth Redirects But No User

**Symptoms:**
- Redirects back to dashboard
- No error shown
- Still shows login button

**Debug:**
1. Check `/auth/debug` endpoint
2. Check Railway logs for OAuth callback
3. Verify `req.user` exists after Passport authentication
4. Check if session is being saved

### Issue: "Invalid Redirect URI"

**Symptoms:**
- Discord shows error when authorizing
- Never reaches callback

**Solutions:**
1. **Exact URL match required:**
   - Discord OAuth redirects must match EXACTLY
   - Check: `https://rainbot-production.up.railway.app/auth/discord/callback`
   - No trailing slash
   - Must be HTTPS (not HTTP)
   
2. **Add to Discord:**
   - Go to Discord Developer Portal
   - OAuth2 → Redirects
   - Add: `https://rainbot-production.up.railway.app/auth/discord/callback`

## Step-by-Step Debugging

### Step 1: Verify Environment Variables

Check Railway logs for:
```
[CONFIG] Found X relevant environment variables: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, ...
```

If missing, check Railway dashboard → Variables

### Step 2: Test Role Verification

1. Make sure you have the required role in a server where bot is present
2. Check logs for: "User X has required role Y in guild Z"
3. If not found, verify:
   - Role ID is correct
   - Bot is in that server
   - User has the role

### Step 3: Check Session Creation

After OAuth callback, check logs for:
```
[AUTH_ROUTES] User YourUsername logged in successfully
[AUTH_ROUTES] Session ID: abc123, Session data: { userId: ..., hasAccess: true }
```

### Step 4: Verify Frontend Auth Check

Check browser console for:
```
Checking authentication status...
Auth check response: 200 OK
Auth check data: { authenticated: true, hasAccess: true, user: {...} }
```

## Testing Checklist

- [ ] Bot is running and connected to Discord
- [ ] `DISCORD_BOT_TOKEN` is set correctly
- [ ] `DISCORD_CLIENT_ID` matches your application
- [ ] `DISCORD_CLIENT_SECRET` is correct
- [ ] `REQUIRED_ROLE_ID` matches the role ID exactly
- [ ] Bot is in the server where user has the role
- [ ] User has the required role in that server
- [ ] OAuth redirect URL is added in Discord Developer Portal
- [ ] Redirect URL matches exactly: `https://rainbot-production.up.railway.app/auth/discord/callback`
- [ ] Session secret is set (`SESSION_SECRET`)
- [ ] Bot has required permissions (View Channels, Manage Roles, Read Member List)

## Still Not Working?

1. **Check Railway logs** - Look for errors during OAuth callback
2. **Visit `/auth/debug`** - See current auth state
3. **Check browser console** - Look for JavaScript errors
4. **Try incognito mode** - Rule out cookie/session issues
5. **Check session files** - Look in `sessions/` directory on Railway

## Quick Test

Run this in browser console after OAuth redirect:
```javascript
fetch('/auth/debug', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log);
```

This will show your current authentication state.

