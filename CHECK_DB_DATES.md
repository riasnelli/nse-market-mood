# How to Check Uploaded CSV Dates in Database

This guide shows you how to check which dates have uploaded CSV data in your MongoDB database.

## Method 1: Using Browser Console (Easiest - No Setup Required)

1. **Open your app** in the browser: `https://nse-market-mood.vercel.app`
2. **Open Developer Tools** (F12 or Cmd+Option+I)
3. **Go to the Console tab**
4. **Run this command**:

```javascript
fetch('/api/save-uploaded-data')
  .then(res => res.json())
  .then(data => {
    if (data.success && data.data && data.data.length > 0) {
      console.log('📊 Uploaded CSV Data in Database:');
      console.log('─'.repeat(60));
      
      // Group by date
      const datesMap = new Map();
      data.data.forEach(item => {
        const date = item.date || 'Unknown';
        if (!datesMap.has(date)) {
          datesMap.set(date, []);
        }
        datesMap.get(date).push(item);
      });
      
      const sortedDates = Array.from(datesMap.keys()).sort();
      
      console.log(`\n📅 Total unique dates: ${sortedDates.length}\n`);
      console.log('Dates with uploaded data:');
      
      sortedDates.forEach((date, index) => {
        const files = datesMap.get(date);
        console.log(`\n${index + 1}. ${date} (${files.length} file(s))`);
        files.forEach((file, fileIndex) => {
          console.log(`   ${fileIndex + 1}. ${file.fileName}`);
          console.log(`      Indices: ${file.indicesCount}`);
          console.log(`      Uploaded: ${new Date(file.uploadedAt).toLocaleString()}`);
        });
      });
      
      console.log('\n' + '─'.repeat(60));
      console.log(`\n✅ Summary: ${sortedDates.length} unique date(s)`);
      console.log(`   Total files: ${data.count}`);
    } else {
      console.log('📭 No uploaded CSV data found in database.');
      if (data.warning) {
        console.log('   Warning:', data.warning);
      }
    }
  })
  .catch(err => console.error('❌ Error:', err));
```

5. **Check the console output** - You'll see all dates with uploaded data listed.

## Method 2: Using Node.js Script (Local Development)

If you have the MongoDB connection string locally:

1. **Create a `.env` file** in the project root (if it doesn't exist):
   ```
   MONGODB_URI=your-mongodb-connection-string
   ```

2. **Install dotenv** (if not already installed):
   ```bash
   npm install dotenv
   ```

3. **Run the check script**:
   ```bash
   node check-db-dates.js
   ```

## Method 3: Check MongoDB Atlas Dashboard

1. **Go to MongoDB Atlas**: https://cloud.mongodb.com
2. **Log in** to your account
3. **Select your cluster**
4. **Click "Browse Collections"**
5. **Select database**: `intraq`
6. **Select collection**: `uploadedData`
7. **View documents** - You'll see all uploaded files with their dates

## Expected Output

When you run the check, you'll see something like:

```
📊 Uploaded CSV Data in Database:
────────────────────────────────────────────────────────────

📅 Total unique dates: 3

Dates with uploaded data:

1. 2025-11-21 (1 file(s))
   1. Dhan - All Nse Indices.csv
      Indices: 111
      Uploaded: 11/21/2025, 10:30:00 AM

2. 2025-11-22 (1 file(s))
   1. NSE_Indices_Data.csv
      Indices: 110
      Uploaded: 11/22/2025, 9:15:00 AM

3. 2025-11-23 (2 file(s))
   1. Market_Data_2025-11-23.csv
      Indices: 111
      Uploaded: 11/23/2025, 3:45:00 PM
   2. Backup_Data.csv
      Indices: 110
      Uploaded: 11/23/2025, 4:20:00 PM

────────────────────────────────────────────────────────────

✅ Summary: 3 unique date(s)
   Total files: 4
```

## Troubleshooting

### If you see "MongoDB not configured":
- The database connection string is not set in Vercel
- Go to Vercel Dashboard → Settings → Environment Variables
- Add `MONGODB_URI` or `storage_MONGODB_URI`

### If you see "No data found":
- No CSV files have been uploaded yet
- Upload a CSV file through the app's "Upload" feature
- Make sure the upload was successful (check for success message)

### If you see connection errors:
- Verify MongoDB Atlas network access allows connections
- Check if the connection string is correct
- Ensure the database name is `intraq`

