# Fix: MongoDB Variable Not Detected

## Issue
You added `storage_MONGODB_URI` to **Project Settings → Shared Variables**, but the app still shows:
```json
{
  "hasMongoUri": false,
  "hasStorageMongoUri": false
}
```

## Root Cause
**Project-level variables** (Shared Variables) might not be automatically available to services. You need to add it at the **Service level**.

## Solution: Add Variable at Service Level

### Step 1: Go to Your Service
1. Railway Dashboard → Your Project
2. Click on your **service** (not project settings)
   - Usually named "web" or "nse-market-mood" or similar
   - This is the actual running service, not the project

### Step 2: Open Service Variables
1. Click on your service
2. Look for **"Variables"** tab at the top
3. OR go to **"Settings"** → **"Variables"**

### Step 3: Add Variable
1. Click **"+ New Variable"** or **"Add Variable"**
2. **Variable Name**: `storage_MONGODB_URI`
3. **Value**: 
   ```
   mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority
   ```
4. Click **"Add"** or **"Save"**

### Step 4: Force Redeploy
After adding the variable:
1. Go to **"Deployments"** tab
2. Click **"..."** (three dots) on the latest deployment
3. Select **"Redeploy"** to force a new deployment with the variable

OR

1. Go to **"Settings"** → **"Deploy"**
2. Click **"Redeploy"** button

## Alternative: Reference Project Variable

If you want to keep it at project level, you can reference it:

1. Go to **Service** → **Variables**
2. Add new variable:
   - **Name**: `storage_MONGODB_URI`
   - **Value**: `${{storage_MONGODB_URI}}`
   - This references the project-level variable

## Verify Variable is Set

### Check Railway Logs
1. Railway Dashboard → Your Service → **"Logs"** tab
2. Look for startup logs
3. You should see environment variables being loaded
4. Look for any MongoDB connection attempts

### Check Deployment
1. Railway Dashboard → Your Service → **"Deployments"** tab
2. Click on the latest deployment
3. Check if it shows the variable in the environment
4. Look for any errors during deployment

## Quick Test

After adding at service level and redeploying:

1. Wait 2-3 minutes for deployment
2. Visit: `https://nse-market-mood-production.up.railway.app/api/data-debug`
3. Should now show:
   ```json
   {
     "hasMongoUri": true,
     "hasStorageMongoUri": true,
     "mongodb": {
       "connected": true
     }
   }
   ```

## Why Service-Level Variables?

- **Project-level variables** are shared across all services in the project
- **Service-level variables** are specific to that service
- Some Railway configurations require service-level variables to be explicitly set
- Service-level variables take precedence over project-level

## Still Not Working?

1. **Check Variable Name**: Must be exactly `storage_MONGODB_URI` (case-sensitive)
2. **Check Value**: Must include `/intraq` before `?`
3. **Force Redeploy**: Don't wait for auto-redeploy, manually trigger it
4. **Check Logs**: Look for any errors in Railway deployment logs
5. **Try Both Names**: Add both `storage_MONGODB_URI` and `MONGODB_URI` with same value

