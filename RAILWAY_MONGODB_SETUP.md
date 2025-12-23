# Railway MongoDB Configuration

## Issue
After uploading CSV files, you're seeing:
```
Engine: No signals — MongoDB not configured. Signals cannot be generated.
```

## Root Cause
Railway doesn't have the MongoDB connection string configured as an environment variable.

## Solution: Add MongoDB URI to Railway

### Step 1: Get Your MongoDB Connection String
Your MongoDB URI should look like:
```
mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

**Important**: Make sure it includes the database name (e.g., `/intraq` before the `?`)

### Step 2: Add to Railway Environment Variables

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project: **nse-market-mood-production**
3. Click on your service/deployment
4. Go to **Variables** tab (or **Settings** → **Variables**)
5. Add these environment variables:

   **Variable Name**: `storage_MONGODB_URI`  
   **Value**: `mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority`

   **OR** (if you prefer the standard name):

   **Variable Name**: `MONGODB_URI`  
   **Value**: `mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority`

### Step 3: Redeploy
After adding the environment variable:
1. Railway will automatically redeploy
2. Wait 2-3 minutes for deployment to complete
3. Check Railway logs to verify MongoDB connection

### Step 4: Verify Connection
Test the connection by visiting:
```
https://nse-market-mood-production.up.railway.app/api/data-debug
```

You should see:
```json
{
  "success": true,
  "mongodb": {
    "connected": true,
    "database": "intraq"
  }
}
```

## Important Notes

1. **Database Name**: Make sure your connection string includes `/intraq` before the `?`
   - ✅ Correct: `...mongodb.net/intraq?retryWrites...`
   - ❌ Wrong: `...mongodb.net/?retryWrites...`

2. **Both Variable Names Work**: The code checks for both `MONGODB_URI` and `storage_MONGODB_URI`, so either one will work.

3. **Security**: Never commit your MongoDB connection string to Git. Always use environment variables.

## After Configuration

Once MongoDB is configured:
- ✅ CSV uploads will save to database
- ✅ Signals will be generated automatically after uploads
- ✅ Uploaded files table will show your data
- ✅ Engine status will show "Active" instead of "MongoDB not configured"

## Troubleshooting

If you still see the error after adding the variable:

1. **Check Railway Logs**: Look for MongoDB connection errors
2. **Verify Variable Name**: Make sure it's exactly `storage_MONGODB_URI` or `MONGODB_URI`
3. **Check Connection String**: Ensure it includes the database name
4. **Wait for Redeploy**: Railway needs 2-3 minutes to redeploy after adding variables

