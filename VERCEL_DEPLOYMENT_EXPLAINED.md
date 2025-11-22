# Understanding Vercel Deployment vs Domains

## The Difference

### **Deployment URL** (Preview)
- Format: `nse-market-mood-{hash}-{team}.vercel.app`
- **Purpose**: Unique URL for each deployment/commit
- **Behavior**: 
  - Created automatically for every push/commit
  - Shows the exact code from that specific commit
  - Used for testing before promoting to production
  - Gets a new URL for each deployment

### **Domains URL** (Production)
- Format: `nse-market-mood.vercel.app` (your custom/production domain)
- **Purpose**: Your main public-facing URL
- **Behavior**:
  - Points to a specific deployment (usually the latest production)
  - Stays the same URL regardless of deployments
  - Users bookmark/share this URL
  - You manually "promote" a deployment to make it live on this domain

## Why They Show Different Versions

1. **Deployment URL** = Latest commit code (always up-to-date)
2. **Domains URL** = Points to a specific deployment (may be older until promoted)

## How to Sync Them

### Option 1: Promote Deployment (Recommended)
1. Go to Vercel Dashboard
2. Find the working deployment (with the features you want)
3. Click "..." → "Promote to Production"
4. Now both URLs will show the same version

### Option 2: Auto-Promote
1. Go to Project Settings → Git
2. Enable "Auto-assign Custom Domains" for `main` branch
3. Every push to `main` automatically becomes production

## Current Situation

- **Deployment URL**: Shows latest code with dynamic colors ✅
- **Domains URL**: Shows older version without dynamic colors ❌

**Solution**: Promote the latest deployment to production!

