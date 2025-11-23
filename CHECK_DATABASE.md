# How to Check if CSV Data is in MongoDB Database

This guide explains multiple ways to verify if your uploaded CSV data is stored in MongoDB.

## Method 1: Using Browser Console (Easiest)

1. **Open your app** in the browser: `https://nse-market-mood.vercel.app`
2. **Open Developer Tools**:
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
   - Safari: Press `Cmd+Option+I` (Mac)
   - Firefox: Press `F12` or `Ctrl+Shift+I`
3. **Go to the Console tab**
4. **Run this command**:

```javascript
fetch('/api/save-uploaded-data')
  .then(res => res.json())
  .then(data => {
    console.log('📊 Database Status:', data);
    if (data.success && data.data && data.data.length > 0) {
      console.log('✅ Found', data.count, 'uploaded file(s) in database:');
      data.data.forEach((file, index) => {
        console.log(`\n${index + 1}. File: ${file.fileName}`);
        console.log(`   Date: ${file.date}`);
        console.log(`   Indices: ${file.indicesCount}`);
        console.log(`   Uploaded: ${new Date(file.uploadedAt).toLocaleString()}`);
        console.log(`   ID: ${file.id}`);
      });
    } else {
      console.log('⚠️ No data found in database. Data might be in localStorage only.');
    }
  })
  .catch(err => console.error('❌ Error:', err));
```

5. **Check the output** - You'll see:
   - ✅ If data exists: List of all uploaded files with details
   - ⚠️ If no data: Warning message
   - ❌ If error: Error details (might indicate MongoDB not configured)

## Method 2: Check MongoDB Atlas Dashboard (Most Detailed)

1. **Go to MongoDB Atlas**: https://cloud.mongodb.com
2. **Log in** to your account
3. **Select your cluster** (the one you're using for this project)
4. **Click "Browse Collections"** in the left sidebar
5. **Select the database**: `intraq` (or your database name)
6. **Select the collection**: `uploadedData`
7. **View documents**: You should see documents with:
   - `fileName`: Name of your CSV file
   - `date`: Date of the data
   - `indices`: Array of all indices data
   - `mood`: Market mood score
   - `vix`: VIX data
   - `uploadedAt`: Timestamp when uploaded
   - `_id`: MongoDB document ID

## Method 3: Check Specific File by Date

If you want to check a specific file by date:

```javascript
// Replace '2025-11-21' with your actual date
fetch('/api/save-uploaded-data?date=2025-11-21')
  .then(res => res.json())
  .then(data => {
    console.log('📅 Files for date:', data);
  })
  .catch(err => console.error('❌ Error:', err));
```

## Method 4: Check Specific File by ID

If you have the document ID from MongoDB:

```javascript
// Replace 'YOUR_DOCUMENT_ID' with actual ID
fetch('/api/save-uploaded-data?id=YOUR_DOCUMENT_ID')
  .then(res => res.json())
  .then(data => {
    console.log('📄 File details:', data);
  })
  .catch(err => console.error('❌ Error:', err));
```

## Method 5: Compare localStorage vs Database

To see if data exists in both places:

```javascript
// Check localStorage
const localData = localStorage.getItem('uploadedIndicesData');
console.log('💾 localStorage:', localData ? 'Has data' : 'No data');

// Check database
fetch('/api/save-uploaded-data')
  .then(res => res.json())
  .then(data => {
    console.log('🗄️ Database:', data.success && data.data.length > 0 ? 'Has data' : 'No data');
    if (data.success && data.data.length > 0) {
      console.log('   Files in DB:', data.data.map(f => f.fileName));
    }
  });
```

## Troubleshooting

### If database shows "MongoDB not configured":
- Check Vercel Environment Variables:
  1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
  2. Ensure `MONGODB_URI` or `storage_MONGODB_URI` is set
  3. Redeploy after adding the variable

### If database is empty but localStorage has data:
- The data was saved to localStorage only
- Upload the CSV again to save it to the database
- Or check if there was an error during the upload (check browser console)

### If you see connection errors:
- Verify MongoDB Atlas network access allows connections from anywhere (or your IP)
- Check if the connection string is correct
- Ensure the database name in the connection string is `intraq`

## Expected Database Structure

Each document in `uploadedData` collection should have:

```json
{
  "_id": "ObjectId(...)",
  "fileName": "Dhan - All Nse Indices.csv",
  "date": "2025-11-21",
  "indices": [
    {
      "symbol": "NIFTY 50",
      "lastPrice": 19500.00,
      "change": 100.00,
      "pChange": 0.52
    },
    // ... more indices
  ],
  "mood": {
    "score": 70,
    "text": "Bullish"
  },
  "vix": {
    "last": 12.50,
    "change": -0.50,
    "pChange": -3.85
  },
  "advanceDecline": {
    "advances": 98,
    "declines": 100
  },
  "source": "uploaded",
  "uploadedAt": "2025-11-21T10:30:00.000Z",
  "updatedAt": "2025-11-21T10:30:00.000Z"
}
```

