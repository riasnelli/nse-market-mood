# Flush Uploaded CSV Data from MongoDB

This guide explains how to delete all CSV-uploaded data from MongoDB.

## What Gets Deleted

The flush operation will delete **ALL** data from these collections:
- ✅ `uploadedIndices` - Indices data uploaded via CSV
- ✅ `uploadedBhav` - Bhavcopy data uploaded via CSV
- ✅ `uploadedPreMarket` - Premarket data uploaded via CSV
- ✅ `uploadedMarketActivity` - Market Activity data uploaded via CSV
- ✅ `uploadedWeek52` - 52W High/Low data uploaded via CSV

## What Does NOT Get Deleted

The following collections are **NOT** affected (auto-stored data):
- ❌ `daily_indices` - Auto-stored from NSE API
- ❌ `daily_bhavcopy` - Auto-stored bhavcopy data
- ❌ `premarket_data` - Auto-stored premarket data
- ❌ `signals` - Generated signals
- ❌ `signal_runs` - Signal run metadata

## Methods to Flush Data

### Method 1: Using Browser Console (Easiest)

1. Open your app in the browser
2. Open Developer Console (F12 or Cmd+Option+I)
3. Run this command:

```javascript
fetch('/api/flush-uploaded-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(res => res.json())
.then(data => {
  console.log('✅ Flush Result:', data);
  if (data.success) {
    alert(`Successfully deleted ${data.totalDeleted} documents!`);
  } else {
    alert('Error: ' + data.error);
  }
})
.catch(err => console.error('Error:', err));
```

### Method 2: Using Shell Script

```bash
./flush-uploaded-data.sh
```

Or if your app is deployed on Vercel:

```bash
VERCEL_URL=your-app.vercel.app ./flush-uploaded-data.sh
```

### Method 3: Using cURL

```bash
curl -X POST https://your-app.vercel.app/api/flush-uploaded-data \
  -H "Content-Type: application/json"
```

### Method 4: Using Postman or Similar Tool

1. Method: `POST`
2. URL: `https://your-app.vercel.app/api/flush-uploaded-data`
3. Headers: `Content-Type: application/json`
4. Body: (empty or `{}`)

## Response Format

Success response:
```json
{
  "success": true,
  "message": "Flushed all uploaded CSV data from MongoDB",
  "totalDeleted": 1234,
  "collections": {
    "uploadedIndices": {
      "deleted": 100,
      "existed": 100
    },
    "uploadedBhav": {
      "deleted": 500,
      "existed": 500
    },
    "uploadedPreMarket": {
      "deleted": 200,
      "existed": 200
    },
    "uploadedMarketActivity": {
      "deleted": 300,
      "existed": 300
    },
    "uploadedWeek52": {
      "deleted": 134,
      "existed": 134
    }
  },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## ⚠️ Warning

**This operation is IRREVERSIBLE!** All CSV-uploaded data will be permanently deleted. Make sure you have backups if needed.

## After Flushing

After flushing, you can:
1. Re-upload CSV files if needed
2. Continue using auto-stored data from NSE API
3. Generate signals using remaining data sources
