# Database Setup for Uploaded Data Storage

The app now supports storing uploaded CSV data in a database for persistence and future use. Currently, the database storage is a placeholder that needs to be implemented.

## Current Implementation

- **API Endpoint**: `/api/save-uploaded-data.js`
- **Methods Supported**: POST (save), GET (retrieve), DELETE (remove)
- **Storage**: Currently logs to console (needs actual database implementation)

## Database Options

You can use any of these database solutions:

### 1. MongoDB Atlas (Recommended for JSON data)
- Free tier: 512MB storage
- Setup: https://www.mongodb.com/cloud/atlas
- Example implementation in `api/save-uploaded-data.js`:
```javascript
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;

async function saveToMongo(data) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('marketmood');
  await db.collection('uploadedData').insertOne(data);
  await client.close();
}
```

### 2. Supabase (PostgreSQL)
- Free tier: 500MB database
- Setup: https://supabase.com
- Example:
```javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function saveToSupabase(data) {
  const { error } = await supabase
    .from('uploaded_data')
    .insert([data]);
}
```

### 3. Vercel KV (Redis)
- Free tier: 256MB
- Built-in for Vercel projects
- Example:
```javascript
import { kv } from '@vercel/kv';

async function saveToKV(data) {
  await kv.set(`upload_${data.id}`, JSON.stringify(data));
}
```

### 4. Firebase Firestore
- Free tier: 1GB storage
- Setup: https://firebase.google.com
- Example:
```javascript
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function saveToFirestore(data) {
  await db.collection('uploadedData').add(data);
}
```

## Implementation Steps

1. **Choose a database** from the options above
2. **Set up environment variables** in Vercel:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add your database connection string/credentials
3. **Install required packages**:
   ```bash
   npm install mongodb  # For MongoDB
   # or
   npm install @supabase/supabase-js  # For Supabase
   # etc.
   ```
4. **Update `api/save-uploaded-data.js`**:
   - Replace the TODO comments with actual database calls
   - Use the examples above as reference
5. **Create database schema/collection**:
   - For MongoDB: Collection `uploadedData`
   - For PostgreSQL: Table `uploaded_data` with columns: id, fileName, dataDate, indices (JSONB), mood (JSONB), vix (JSONB), advanceDecline (JSONB), uploadedAt
6. **Test the implementation**:
   - Upload a CSV file
   - Check database to verify data is saved
   - Test retrieval via GET endpoint

## Data Structure

The uploaded data follows this structure:
```json
{
  "id": "upload_1234567890",
  "fileName": "nse-indices.csv",
  "dataDate": "2024-01-15",
  "indices": [
    {
      "symbol": "NIFTY 50",
      "lastPrice": 26068.15,
      "change": -124.00,
      "pChange": -0.47
    }
  ],
  "mood": {
    "score": 30,
    "text": "Slightly Bearish",
    "emoji": "🙁"
  },
  "vix": {
    "last": 13.63,
    "change": 1.49,
    "pChange": 12.27
  },
  "advanceDecline": {
    "advances": 0,
    "declines": 0
  },
  "uploadedAt": "2024-01-15T10:30:00.000Z"
}
```

## Features

- ✅ **Save uploaded data** to database
- ✅ **Retrieve uploaded data** by ID or date
- ✅ **Delete uploaded data** from database
- ✅ **Select uploaded data** as active data source in settings
- ✅ **Fallback to localStorage** if database is not configured

## Notes

- The app will continue to work with localStorage even if database is not configured
- Database storage is optional but recommended for production use
- Multiple uploaded files can be stored and selected from settings

