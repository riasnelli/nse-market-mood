# Quick Fix: Add MongoDB to Railway

## The Problem
Your Railway deployment shows:
```json
{
  "error": "MongoDB URI not configured",
  "hasMongoUri": false,
  "hasStorageMongoUri": false
}
```

## Solution: Add Environment Variable

### Step-by-Step Instructions

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Login to your account
   - Click on your project: **nse-market-mood-production**

2. **Open Your Service**
   - Click on the service/deployment (usually shows as "web" or your service name)

3. **Go to Variables Tab**
   - Click on **"Variables"** tab (or **Settings** → **Variables**)
   - This is where you add environment variables

4. **Add New Variable**
   - Click **"+ New Variable"** or **"Add Variable"**
   - **Variable Name**: `storage_MONGODB_URI`
   - **Value**: Copy and paste this EXACT string:
     ```
     mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority
     ```
   - **Important**: Make sure it includes `/intraq` before the `?`

5. **Save**
   - Click **"Save"** or **"Add"**
   - Railway will automatically redeploy (takes 2-3 minutes)

6. **Verify**
   - Wait 2-3 minutes for redeploy
   - Visit: `https://nse-market-mood-production.up.railway.app/api/data-debug`
   - Should now show:
     ```json
     {
       "success": true,
       "hasMongoUri": true,
       "mongodb": {
         "connected": true
       }
     }
     ```

## Connection String Format

✅ **Correct Format** (with database name):
```
mongodb+srv://...@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority
                                                      ^^^^^^^
                                                      Database name included
```

❌ **Wrong Format** (missing database name):
```
mongodb+srv://...@intraq.d6efrp3.mongodb.net/?retryWrites=true&w=majority
                                                      ^
                                                      Missing /intraq
```

## Alternative Variable Name

If `storage_MONGODB_URI` doesn't work, you can also use:
- **Variable Name**: `MONGODB_URI`
- **Same Value**: `mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority`

The code checks for both names, so either will work.

## After Adding the Variable

Once Railway redeploys (2-3 minutes):
- ✅ CSV uploads will save to database
- ✅ Signals will generate automatically
- ✅ Uploaded files table will show data
- ✅ Engine status will show "Active"
- ✅ `/api/data-debug` will show `"connected": true`

## Troubleshooting

**Still showing error after adding variable?**
1. Wait 3-5 minutes for full redeploy
2. Check Railway logs for any errors
3. Verify variable name is exactly `storage_MONGODB_URI` (case-sensitive)
4. Verify connection string includes `/intraq` before `?`
5. Try refreshing the `/api/data-debug` page

**Can't find Variables tab?**
- Look for **"Settings"** → **"Variables"**
- Or **"Environment"** → **"Variables"**
- Or click on your service → **"Variables"** tab

