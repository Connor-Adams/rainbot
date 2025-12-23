# Railway Storage Bucket Setup Guide

Railway provides S3-compatible storage buckets that you can use to store sound files persistently. This guide walks you through setting it up.

## Why Use Railway Storage?

- **Persistent storage** - Files survive deployments and restarts
- **Scalable** - No disk space limits on your service
- **S3-compatible** - Works with standard AWS SDK
- **Easy integration** - Built into Railway platform

## Step 1: Create a Storage Bucket in Railway

1. Go to your Railway project dashboard
2. Click **"+ New"** → **"Storage"**
3. Select **"Create Storage"**
4. Give it a name (e.g., `rainbot-sounds`)
5. Railway will create the bucket and provide credentials

## Step 2: Get Storage Credentials

After creating the storage bucket, Railway will provide:

1. **Endpoint URL** - S3-compatible endpoint (e.g., `https://storage.railway.app`)
2. **Access Key** - Your access key ID
3. **Secret Key** - Your secret access key
4. **Bucket Name** - The name you gave it
5. **Region** - Usually `us-east-1` (default)

## Step 3: Set Environment Variables

In your Railway service, add these environment variables:

```bash
STORAGE_BUCKET_NAME=rainbot-sounds
STORAGE_ACCESS_KEY=your_access_key_here
STORAGE_SECRET_KEY=your_secret_key_here
STORAGE_ENDPOINT=https://storage.railway.app
STORAGE_REGION=us-east-1
```

**Note:** Railway may provide these automatically. Check your storage bucket settings in Railway dashboard.

## Step 4: Deploy

After setting the environment variables, Railway will automatically:

- Install `@aws-sdk/client-s3` package
- Initialize storage with Railway bucket
- Use S3 storage instead of local filesystem

## How It Works

### Automatic Detection

The code automatically detects if Railway storage is configured:

- **If storage env vars are set** → Uses Railway S3 bucket
- **If not set** → Falls back to local filesystem (`./sounds/` directory)

### Storage Operations

All storage operations work the same way:

- **Upload** - Files are uploaded to `sounds/` prefix in bucket
- **List** - Lists all files in `sounds/` prefix
- **Delete** - Removes files from bucket
- **Play** - Streams files directly from bucket

### Backward Compatibility

The code maintains backward compatibility:

- Local storage still works if Railway storage isn't configured
- Existing local files continue to work
- No code changes needed - just set environment variables

## Migration from Local to Railway Storage

If you have existing sounds in local storage:

1. **Option 1: Upload via Dashboard**
   - Use the web dashboard to re-upload sounds
   - They'll automatically go to Railway storage

2. **Option 2: Manual Migration**
   - Download sounds from local storage
   - Upload them via the dashboard after Railway storage is configured

## Troubleshooting

### Storage Not Working

**Check logs for:**

```
[STORAGE] Storage initialized: Railway S3 bucket "rainbot-sounds"
```

**If you see:**

```
[STORAGE] Storage initialized: Local filesystem
```

Then Railway storage isn't configured. Check:

- Environment variables are set correctly
- Storage bucket exists in Railway
- Credentials are valid

### Upload Failures

**Common issues:**

- **Invalid credentials** - Check `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY`
- **Wrong endpoint** - Verify `STORAGE_ENDPOINT` matches Railway's endpoint
- **Bucket doesn't exist** - Ensure bucket name matches exactly
- **Permissions** - Railway buckets should have full access by default

### File Not Found Errors

**If files were uploaded to local storage but now using Railway:**

- Files need to be re-uploaded to Railway storage
- Local files won't be accessible when using Railway storage

## Environment Variables Reference

| Variable              | Description                       | Required                  |
| --------------------- | --------------------------------- | ------------------------- |
| `STORAGE_BUCKET_NAME` | Name of Railway storage bucket    | Yes (for Railway storage) |
| `STORAGE_ACCESS_KEY`  | Access key ID from Railway        | Yes (for Railway storage) |
| `STORAGE_SECRET_KEY`  | Secret access key from Railway    | Yes (for Railway storage) |
| `STORAGE_ENDPOINT`    | S3 endpoint URL from Railway      | Yes (for Railway storage) |
| `STORAGE_REGION`      | AWS region (default: `us-east-1`) | No                        |

## Local Development

For local development, you can:

1. **Use local storage** - Don't set storage env vars (default)
2. **Use Railway storage** - Set the same env vars in `.env` file
3. **Use both** - Test with local, deploy with Railway

## Benefits of Railway Storage

✅ **Persistent** - Files survive deployments  
✅ **Scalable** - No disk space limits  
✅ **Fast** - Optimized for Railway infrastructure  
✅ **Reliable** - Backed by Railway's infrastructure  
✅ **Easy** - No external services needed

That's it! Once configured, all sound uploads will automatically use Railway storage.
