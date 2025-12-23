# How to Access Your Railway Deployment

## Step 1: Get Your Railway Domain

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Sign in to your account

2. **Navigate to Your Project**
   - Click on your project: `nse-market-mood`
   - Click on your service (the deployed app)

3. **Get the Domain**
   - Go to **Settings** tab
   - Scroll down to **Networking** section
   - You'll see a **Public Domain** section
   - Click **"Generate Domain"** if you don't have one yet
   - Your domain will look like: `nse-market-mood-production.up.railway.app`

## Step 2: Access Your App

Once you have the domain, access your app at:

```
https://your-domain.up.railway.app
```

For example:
```
https://nse-market-mood-production.up.railway.app
```

## Step 3: Test Your API Endpoints

Test these endpoints in your browser or using curl:

### 1. Main App
```
https://your-domain.up.railway.app
```

### 2. API Health Check
```
https://your-domain.up.railway.app/api/data-debug
```

### 3. Get Uploaded Dates
```
https://your-domain.up.railway.app/api/data?action=dates
```

### 4. Get Signals
```
https://your-domain.up.railway.app/api/signals?date=2025-12-19&strategy=momentum_gap
```

### 5. Market Data
```
https://your-domain.up.railway.app/api/market?action=history
```

## Step 4: Verify Deployment Status

1. **Check Deployment Status**
   - In Railway dashboard, go to **Deployments** tab
   - Look for a green checkmark (✓) indicating successful deployment
   - If you see a red X, check the logs for errors

2. **View Logs**
   - Click on **Logs** tab in Railway dashboard
   - You should see:
     ```
     🚀 NSE Market Mood Dev Server running on http://0.0.0.0:3000
     🌐 Access the app at: http://localhost:3000
     ```

## Troubleshooting

### If the domain doesn't work:

1. **Check if deployment is complete**
   - Go to **Deployments** tab
   - Wait for deployment to finish (green checkmark)

2. **Check if service is running**
   - Go to **Metrics** tab
   - Check if CPU/Memory usage is active

3. **Check logs for errors**
   - Go to **Logs** tab
   - Look for any error messages

4. **Verify environment variables**
   - Go to **Variables** tab
   - Ensure all required variables are set:
     - `MONGODB_URI`
     - `APP_KEY`
     - `NODE_ENV=production`

### Common Issues:

**Issue: "Cannot GET /"**
- **Solution**: Check if `server.js` is running correctly
- Check logs for startup messages

**Issue: "Connection refused"**
- **Solution**: Service might not be running
- Check deployment status
- Restart the service if needed

**Issue: API endpoints return 404**
- **Solution**: Check if API routes are mounted correctly in `server.js`
- Verify the route paths match

## Custom Domain (Optional)

If you want to use your own domain:

1. Go to **Settings** → **Networking**
2. Click **"Add Custom Domain"**
3. Enter your domain (e.g., `nse-market-mood.com`)
4. Follow the DNS setup instructions
5. Railway will provide SSL automatically

## Quick Access Checklist

- [ ] Railway deployment is successful (green checkmark)
- [ ] Service is running (check Metrics tab)
- [ ] Domain is generated (Settings → Networking)
- [ ] Environment variables are set
- [ ] Can access main page: `https://your-domain.up.railway.app`
- [ ] Can access API: `https://your-domain.up.railway.app/api/data-debug`

## Need Help?

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check Railway status: https://status.railway.app

