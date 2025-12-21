# How to Check MongoDB Connection String in Vercel

## Step-by-Step Instructions:

### 1. Go to Vercel Dashboard
- Visit [vercel.com](https://vercel.com) and log in
- Navigate to your project: **nse-market-mood**

### 2. Access Environment Variables
- Click on your project
- Go to **Settings** (in the top navigation)
- Click on **Environment Variables** (in the left sidebar)

### 3. Check for MONGODB_URI
Look for one of these variable names:
- `MONGODB_URI` (most common)
- `storage_MONGODB_URI` (Vercel Storage naming)

### 4. Verify the Value
- The value should be a MongoDB connection string like:
  ```
  mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
  ```
- **Important**: The value should be hidden (showing dots/asterisks) for security
- Click the eye icon to reveal it (if you have permission)

### 5. Check Environment Scope
Make sure the variable is set for the correct environments:
- ✅ **Production** (for production deployments)
- ✅ **Preview** (for preview deployments)
- ✅ **Development** (optional, for local dev)

### 6. Verify Database Name
The connection string should include a database name. Common formats:
- `mongodb+srv://.../intraq?retryWrites=true&w=majority`
- `mongodb+srv://.../nse-market-mood?retryWrites=true&w=majority`

## If MONGODB_URI is Missing:

1. **Get your MongoDB connection string** from MongoDB Atlas:
   - Go to [MongoDB Atlas](https://cloud.mongodb.com)
   - Click **Connect** on your cluster
   - Choose **Connect your application**
   - Copy the connection string
   - Replace `<password>` with your actual password
   - Replace `<database>` with your database name (e.g., `intraq`)

2. **Add it to Vercel**:
   - In Vercel → Settings → Environment Variables
   - Click **Add New**
   - Key: `MONGODB_URI`
   - Value: Your connection string
   - Select environments: Production, Preview, Development
   - Click **Save**

3. **Redeploy**:
   - After adding/updating the variable, you need to redeploy
   - Go to **Deployments** tab
   - Click the three dots (⋯) on the latest deployment
   - Click **Redeploy**

## Quick Test:

You can also check if the variable is accessible by looking at Vercel function logs:
1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click on a function (e.g., `/api/data`)
4. Check the logs for any MongoDB connection errors

## Common Issues:

- **Variable not set**: You'll see errors like "MONGODB_URI environment variable is not set"
- **Wrong format**: Connection string should start with `mongodb://` or `mongodb+srv://`
- **Network access**: Make sure MongoDB Atlas allows connections from Vercel IPs (0.0.0.0/0 for all)
- **Authentication**: Username/password in connection string must be correct

