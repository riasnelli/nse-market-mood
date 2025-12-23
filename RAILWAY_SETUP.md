# Railway Deployment Guide

## Overview
This guide will help you migrate from Vercel to Railway to avoid the 12-function limit.

## Prerequisites
- GitHub account (your code is already on GitHub)
- Railway account (sign up at https://railway.app)
- MongoDB connection string (already have this)

## Step-by-Step Setup

### 1. Create Railway Account
1. Go to https://railway.app
2. Click "Start a New Project"
3. Sign up with GitHub (recommended) or email

### 2. Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository: `riasnelli/nse-market-mood`
4. Railway will auto-detect Node.js

### 3. Configure Environment Variables
In Railway dashboard, go to your service → Variables tab, add:

```
MONGODB_URI=mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority
storage_MONGODB_URI=mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority
APP_KEY=3ae91342e4fe6452aa481bafb455d5365a924cf36846fa8297c4ecdba73fa17
NODE_ENV=production
PORT=3000
```

**Note:** Railway automatically sets `PORT`, but you can override it.

### 4. Configure Build Settings
Railway should auto-detect:
- **Build Command:** `npm install` (or leave empty, Railway handles it)
- **Start Command:** `npm start`
- **Root Directory:** `/` (root)

### 5. Deploy
1. Railway will automatically deploy when you connect the repo
2. Watch the build logs in the Railway dashboard
3. Wait for deployment to complete (usually 2-3 minutes)

### 6. Get Your Domain
1. Go to your service → Settings → Networking
2. Click "Generate Domain" or "Add Custom Domain"
3. Railway provides a free `.railway.app` domain
4. Copy the domain URL (e.g., `nse-market-mood-production.up.railway.app`)

### 7. Test Your Deployment
1. Visit your Railway domain
2. Test API endpoints:
   - `https://your-domain.railway.app/api/data?action=dates`
   - `https://your-domain.railway.app/api/signals?date=2025-12-19`
3. Check logs in Railway dashboard for any errors

## Key Differences from Vercel

### ✅ Advantages
- **No function limit** - Railway runs a full Node.js server
- **Longer execution times** - No 10s/60s limits
- **More memory** - Better for large operations
- **Persistent connections** - Better MongoDB connection pooling
- **Simpler deployment** - One server, not multiple functions

### ⚠️ Changes Needed
- **Single server** - All API routes run on one Express server
- **No serverless** - Traditional Node.js server (better for your use case)
- **Port binding** - Must bind to `0.0.0.0` and use `PORT` env var (already done)

## File Changes Made

### 1. Updated `server.js`
- Updated API routes list to match current files
- Added CORS middleware
- Improved error handling

### 2. Updated `package.json`
- Added `express` dependency
- Added `start` script: `node server.js`
- Kept `@vercel/functions` (won't hurt, just won't be used)

### 3. Created `railway.json`
- Railway configuration file
- Specifies build and deploy commands

## Troubleshooting

### Build Fails
- Check Railway build logs
- Ensure `package.json` has all dependencies
- Verify Node.js version (Railway auto-detects, usually latest LTS)

### API Routes Not Working
- Check server.js logs in Railway
- Verify all API files are in `api/` directory
- Check CORS headers are set correctly

### MongoDB Connection Issues
- Verify `MONGODB_URI` environment variable is set
- Check MongoDB Atlas IP whitelist includes Railway IPs (or `0.0.0.0/0`)
- Check connection string format

### Port Issues
- Railway sets `PORT` automatically
- Server.js already uses `process.env.PORT || 3001`
- Should work out of the box

## Monitoring

### View Logs
1. Go to Railway dashboard
2. Click your service
3. Click "Logs" tab
4. Real-time logs are shown

### Metrics
- Railway dashboard shows:
  - CPU usage
  - Memory usage
  - Network traffic
  - Request count

## Custom Domain (Optional)

1. Go to Settings → Networking
2. Click "Add Custom Domain"
3. Enter your domain (e.g., `nse-market-mood.com`)
4. Follow DNS setup instructions
5. Railway provides SSL automatically

## Cost Comparison

### Vercel Hobby Plan
- Free tier: Limited functions, execution time limits
- Pro: $20/month for more functions

### Railway
- **Hobby Plan:** $5/month (500 hours free, then $0.000463/hour)
- **Pro Plan:** $20/month (unlimited usage)
- **Better value** for your use case (no function limits)

## Rollback Plan

If Railway doesn't work:
1. Keep Vercel deployment active
2. Test Railway thoroughly before switching
3. Can run both simultaneously (different domains)
4. Switch DNS when ready

## Next Steps After Deployment

1. ✅ Test all API endpoints
2. ✅ Test CSV upload functionality
3. ✅ Test signal generation
4. ✅ Update frontend API URLs if needed (should work with same URLs)
5. ✅ Monitor logs for first 24 hours
6. ✅ Set up custom domain (optional)

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check Railway status: https://status.railway.app

