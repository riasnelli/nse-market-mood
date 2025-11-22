# How to Deploy to Vercel

## Method 1: Auto-Deploy via GitHub (Recommended)

If your Vercel project is connected to GitHub:

1. **Commit your changes:**
   ```bash
   git commit -m "Add PWA icons, update documentation, and fix project structure"
   ```

2. **Push to GitHub:**
   ```bash
   git push origin main
   ```

3. **Vercel will automatically:**
   - Detect the push
   - Build your project
   - Deploy the new version
   - You'll see the deployment in your Vercel dashboard

## Method 2: Deploy via Vercel CLI

If you prefer to deploy manually:

1. **Install Vercel CLI (if not already installed):**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy to production:**
   ```bash
   vercel --prod
   ```

   Or for a preview deployment:
   ```bash
   vercel
   ```

## Method 3: Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Select your project
3. Click "Redeploy" or trigger a new deployment from the dashboard

## Verify Deployment

After deployment, check:
- Your app URL (provided by Vercel)
- PWA icons are loading correctly
- API endpoint `/api/nse-data` is working
- Service worker is registered

## Troubleshooting

- If auto-deploy isn't working, check your Vercel project settings → Git Integration
- Make sure `vercel.json` is in the root directory
- Check Vercel build logs for any errors

