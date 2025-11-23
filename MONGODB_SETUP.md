# MongoDB Atlas Setup Guide

This guide will help you set up MongoDB Atlas (free tier) to store uploaded CSV data for your NSE Market Mood app.

## Step 1: Create MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Sign up for a free account (no credit card required)
3. Verify your email address

## Step 2: Create a Cluster

1. After logging in, click **"Build a Database"** or **"Create"**
2. Choose the **FREE (M0) Shared** cluster option
3. Select a cloud provider and region (choose one closest to you or your Vercel deployment region)
4. Click **"Create"** (cluster creation takes 3-5 minutes)

## Step 3: Create Database User

1. While the cluster is being created, set up a database user:
   - Go to **"Database Access"** in the left sidebar
   - Click **"Add New Database User"**
   - Choose **"Password"** authentication
   - Enter a username (e.g., `marketmood_user`)
   - Click **"Autogenerate Secure Password"** or create your own
   - **IMPORTANT:** Copy and save the password securely (you'll need it for the connection string)
   - Set user privileges to **"Atlas admin"** or **"Read and write to any database"**
   - Click **"Add User"**

## Step 4: Configure Network Access

1. Go to **"Network Access"** in the left sidebar
2. Click **"Add IP Address"**
3. For Vercel deployments, click **"Allow Access from Anywhere"** (or add `0.0.0.0/0`)
   - **Note:** For production, you can restrict to Vercel's IP ranges, but allowing from anywhere is fine for hobby projects
4. Click **"Confirm"**

## Step 5: Get Connection String

1. Go back to **"Database"** in the left sidebar
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Select **"Node.js"** as the driver and **"4.1 or later"** as the version
5. Copy the connection string (it will look like):
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>` with your database username
7. Replace `<password>` with your database password (URL-encode special characters if needed)
8. Add your database name at the end (before `?`):
   ```
   mongodb+srv://marketmood_user:yourpassword@cluster0.xxxxx.mongodb.net/marketmood?retryWrites=true&w=majority
   ```

## Step 6: Set Environment Variable in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **"Settings"** → **"Environment Variables"**
3. Click **"Add New"**
4. Enter:
   - **Key:** `MONGODB_URI`
   - **Value:** Your complete connection string (from Step 5)
5. Select environments: **Production**, **Preview**, and **Development** (or as needed)
6. Click **"Save"**

## Step 7: Redeploy Your Application

After adding the environment variable:

1. Go to **"Deployments"** tab in Vercel
2. Click the **"..."** menu on your latest deployment
3. Click **"Redeploy"** (this ensures the new environment variable is available)

Alternatively, push a new commit to trigger a new deployment.

## Step 8: Verify the Setup

1. Upload a CSV file through your app
2. Check the browser console for success messages
3. Check Vercel function logs to see if data was saved:
   - Go to **"Logs"** tab in Vercel
   - Look for: `✅ Connected to MongoDB Atlas` and `✅ Data saved to MongoDB`

## Troubleshooting

### Connection Errors

- **"MongoServerError: Authentication failed"**
  - Check that your username and password in the connection string are correct
  - Ensure special characters in the password are URL-encoded (e.g., `@` becomes `%40`)

- **"MongoNetworkError: Timeout"**
  - Verify that your IP address is allowed in Network Access
  - Check that the connection string includes the correct cluster URL

- **"MONGODB_URI environment variable is not set"**
  - Ensure you've added the environment variable in Vercel
  - Redeploy your application after adding the variable

### Testing Locally

To test MongoDB connection locally:

1. Create a `.env.local` file in your project root:
   ```
   MONGODB_URI=your_connection_string_here
   ```
2. Install dependencies: `npm install`
3. Test the API endpoint locally (if using Vercel CLI: `vercel dev`)

## Database Structure

The uploaded data is stored in a collection called `uploadedData` with the following structure:

```javascript
{
  _id: ObjectId,
  fileName: "uploaded.csv",
  date: "2025-01-15",
  indices: [
    { symbol: "NIFTY 50", lastPrice: 22000, change: 50, pChange: 0.23 },
    // ... more indices
  ],
  mood: { score: 65, text: "Bullish", emoji: "😊" },
  vix: { last: 12.5, change: -0.1, pChange: -0.8 },
  advanceDecline: { advances: 28, declines: 17 },
  timestamp: "2025-01-15T10:30:00.000Z",
  source: "uploaded",
  uploadedAt: ISODate,
  updatedAt: ISODate
}
```

## Free Tier Limits

- **Storage:** 512 MB
- **RAM:** Shared (512 MB)
- **Database Users:** Unlimited
- **Network Access:** Configurable IP whitelist

For hobby projects, this is usually more than enough!

## Next Steps

Once MongoDB is set up:
- Uploaded CSV data will be automatically saved to the database
- Data persists across devices and browsers
- You can view/manage data in MongoDB Atlas dashboard
- The app will continue to work with localStorage as a fallback if MongoDB is not configured

