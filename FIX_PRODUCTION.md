# How to Fix Production Domain

## The Issue
Your production domain (`nse-market-mood.vercel.app`) is showing an older/broken version, while the preview deployment is working correctly.

## Solution: Promote Preview to Production

### Option 1: Via Vercel Dashboard (Easiest)

1. Go to [vercel.com](https://vercel.com)
2. Open your **NSE Market Mood** project
3. Find the deployment that's working (the one with commit `31ae314`)
4. Click the **"..."** menu (three dots) on that deployment
5. Select **"Promote to Production"**

This will make the production domain point to the working deployment.

### Option 2: Via Vercel CLI

```bash
# Install Vercel CLI if not installed
npm install -g vercel

# Login
vercel login

# Deploy to production (this will use the latest code)
vercel --prod
```

### Option 3: Check Project Settings

1. Go to Vercel Dashboard → Your Project → Settings
2. Check **"Git"** section
3. Ensure **"Production Branch"** is set to `main`
4. Check **"Auto-assign Custom Domains"** is enabled

## Verify Fix

After promoting:
- Visit `nse-market-mood.vercel.app` 
- It should show the same working version as the preview URL
- Data should load correctly

## Why This Happened

- The production domain was pointing to an older deployment
- The preview deployment (git-based URL) always uses the latest commit
- You need to manually promote preview deployments to production, or configure auto-promotion

