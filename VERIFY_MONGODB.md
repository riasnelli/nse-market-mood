# Verify MongoDB Connection

## ✅ Variable Added Successfully!

I can see you've added `storage_MONGODB_URI` to Railway. Now let's verify it's working.

## Step 1: Wait for Railway Redeploy

Railway automatically redeploys when you add environment variables. This takes **2-3 minutes**.

**How to check if redeploy is complete:**
1. Go to Railway Dashboard
2. Click on your service
3. Go to **"Deployments"** tab
4. Look for a new deployment (should show "Deploying" or "Active")
5. Wait until it shows **"Active"** (green checkmark)

## Step 2: Test the Connection

After 2-3 minutes, visit this URL in your browser:

```
https://nse-market-mood-production.up.railway.app/api/data-debug
```

### ✅ Success Response (What you should see):
```json
{
  "success": true,
  "environment": {
    "hasMongoUri": true,
    "hasStorageMongoUri": true,
    "mongoUriPrefix": "mongodb+srv://Vercel-Admin..."
  },
  "mongodb": {
    "connected": true,
    "database": "intraq"
  }
}
```

### ❌ Still Error? (What you might see):
```json
{
  "success": false,
  "error": "MongoDB URI not configured"
}
```

If you still see an error:
- Wait another 1-2 minutes (Railway might still be deploying)
- Check Railway logs for any errors
- Verify the variable name is exactly `storage_MONGODB_URI`
- Verify the connection string includes `/intraq` before `?`

## Step 3: Test CSV Upload

Once `/api/data-debug` shows `"connected": true`:

1. Go to your app: `https://nse-market-mood-production.up.railway.app`
2. Click "Upload CSV Data"
3. Upload a CSV file
4. Check if:
   - ✅ Upload shows "Data uploaded successfully!"
   - ✅ Table shows your uploaded files
   - ✅ Engine status shows "Active" instead of "MongoDB not configured"

## Step 4: Check Signals

After uploading CSV files:

1. Go to **Signals** page
2. Engine status should show:
   - ✅ "Active — X signals generated" (if signals found)
   - ✅ "Connected — no signals generated yet" (if no matches)
   - ❌ NOT "MongoDB not configured"

## Troubleshooting

**If `/api/data-debug` still shows error after 5 minutes:**

1. **Check Railway Logs:**
   - Railway Dashboard → Your Service → **"Logs"** tab
   - Look for MongoDB connection errors
   - Look for environment variable loading messages

2. **Verify Variable:**
   - Go back to Railway → Project Settings → Shared Variables
   - Confirm `storage_MONGODB_URI` is listed
   - Click on it to verify the value is correct
   - Make sure it includes `/intraq` before `?`

3. **Check Service-Level Variables:**
   - Sometimes variables need to be at service level, not project level
   - Go to: Railway → Your Service → **"Variables"** tab
   - Add `storage_MONGODB_URI` there if it's not already

4. **Try Alternative Variable Name:**
   - If `storage_MONGODB_URI` doesn't work, try `MONGODB_URI`
   - Add it with the same connection string value

## Expected Timeline

- **0-2 minutes**: Railway detects new variable, starts deployment
- **2-3 minutes**: Deployment completes
- **3-5 minutes**: Service restarts with new environment variable
- **After 5 minutes**: `/api/data-debug` should show `"connected": true`

## Success Indicators

Once everything is working, you should see:

✅ `/api/data-debug` shows `"connected": true`  
✅ CSV uploads save successfully  
✅ Uploaded files table shows your data  
✅ Signals page shows "Active" engine status  
✅ No more "MongoDB not configured" errors

