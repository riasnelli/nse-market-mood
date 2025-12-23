# 🚨 QUICK FIX: Add MongoDB to Railway

## Current Error
```json
{
  "error": "MongoDB URI not configured",
  "hasMongoUri": false,
  "hasStorageMongoUri": false
}
```

## ✅ Solution: Add Environment Variable in Railway

### Step 1: Open Railway Dashboard
1. Go to: https://railway.app
2. Login to your account
3. Find and click on: **nse-market-mood-production** project

### Step 2: Open Your Service
- Click on your service (usually named "web" or "nse-market-mood")
- This opens the service details page

### Step 3: Go to Variables Tab
- Look for **"Variables"** tab at the top
- OR go to **"Settings"** → **"Variables"**
- OR look for **"Environment"** section

### Step 4: Add New Variable
1. Click **"+ New Variable"** or **"Add Variable"** button
2. In the form that appears:
   - **Key/Name field**: Type exactly: `storage_MONGODB_URI`
   - **Value field**: Paste this EXACT string:
     ```
     mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority
     ```
3. Click **"Add"** or **"Save"**

### Step 5: Wait for Redeploy
- Railway will automatically detect the new variable
- It will start a new deployment (you'll see it in the Deployments tab)
- Wait **2-3 minutes** for deployment to complete

### Step 6: Verify
After 2-3 minutes, visit:
```
https://nse-market-mood-production.up.railway.app/api/data-debug
```

You should now see:
```json
{
  "success": true,
  "hasMongoUri": true,
  "hasStorageMongoUri": true,
  "mongodb": {
    "connected": true,
    "database": "intraq"
  }
}
```

## 🔍 Where to Find Variables in Railway

If you can't find the Variables tab, try these locations:

1. **Service Page** → Top tabs → **"Variables"**
2. **Service Page** → **"Settings"** → **"Variables"**
3. **Project Page** → **"Variables"** (project-level variables)
4. **Service Page** → **"Environment"** section

## ⚠️ Important Notes

1. **Variable Name**: Must be exactly `storage_MONGODB_URI` (case-sensitive)
2. **Connection String**: Must include `/intraq` before the `?`
3. **No Spaces**: Don't add any spaces before/after the value
4. **Redeploy**: Railway auto-redeploys when you add variables (takes 2-3 min)

## 🆘 Still Not Working?

If after 3 minutes you still see the error:

1. **Check Variable Name**: 
   - Should be exactly: `storage_MONGODB_URI`
   - Not: `MONGODB_URI` (unless you want to use that instead)
   - Not: `STORAGE_MONGODB_URI` (wrong case)

2. **Check Connection String**:
   - Should end with: `...net/intraq?retryWrites...`
   - Not: `...net/?retryWrites...` (missing `/intraq`)

3. **Check Railway Logs**:
   - Go to Railway → Your Service → **"Deployments"** → Latest deployment → **"Logs"**
   - Look for any MongoDB connection errors

4. **Try Alternative Variable Name**:
   - If `storage_MONGODB_URI` doesn't work, try `MONGODB_URI` with the same value

## 📝 Exact Values to Use

**Variable Name:**
```
storage_MONGODB_URI
```

**Variable Value:**
```
mongodb+srv://Vercel-Admin-intraq:G0djrEWHCrqEWcFq@intraq.d6efrp3.mongodb.net/intraq?retryWrites=true&w=majority
```

Copy and paste these EXACTLY as shown above.

