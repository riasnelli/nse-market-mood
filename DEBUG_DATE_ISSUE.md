# Debug Date Issue: "25/20" Display

## Problem
You uploaded a bhavcopy for **22/12** (December 22, 2025), but the table shows **"25/20"**.

## What "25/20" Means
This indicates the date stored in the database is invalid:
- Format: `2025-20-25` (year=2025, month=20 ❌, day=25)
- When formatted as DD/MM: `25/20` (day=25, month=20)

## Root Cause
The date is being corrupted during upload. Possible causes:
1. **Date picker value is wrong** - Check what date is selected in the upload form
2. **Filename parsing is wrong** - The date extracted from filename might be incorrect
3. **Date format mismatch** - Date might be in wrong format (DD/MM/YYYY vs YYYY-MM-DD)

## How to Debug

### Step 1: Check Browser Console
When you upload, look for these logs:
```
📤 Upload details: { date: "2025-12-22", ... }
📅 Date validation: filename="...", parsed="...", provided="...", final="..."
```

### Step 2: Check What Date is Stored
1. Open browser console (F12)
2. Go to Network tab
3. Find the upload request to `/api/data?action=save`
4. Check the request payload - what `date` value is being sent?

### Step 3: Check Database
The date might already be stored incorrectly. To fix:
1. Delete the incorrect entry from the table
2. Re-upload the file with the correct date selected

## Fix Applied

I've added date validation that:
- ✅ Validates date format (YYYY-MM-DD)
- ✅ Validates year (2000-2100), month (1-12), day (1-31)
- ✅ Falls back to provided date or today if invalid
- ✅ Logs warnings for invalid dates

## Next Steps

1. **Check the upload form date picker**:
   - When you open the upload modal, what date is shown?
   - Make sure it's set to **2025-12-22** (not 2025-20-25)

2. **Re-upload with correct date**:
   - Delete the incorrect entry (if possible)
   - Upload again, making sure the date picker shows **2025-12-22**
   - Check browser console for date validation logs

3. **Check filename**:
   - What is the exact filename of your bhavcopy file?
   - It should be something like: `sec_bhavdata_full_20251222.csv`
   - The date parser extracts date from filename if available

## Expected Behavior

After the fix:
- ✅ Invalid dates will be rejected and fall back to form date
- ✅ Date validation logs will show what's happening
- ✅ Table will show correct dates like "22/12" instead of "25/20"

## If Issue Persists

Share:
1. The exact filename of your bhavcopy file
2. The date shown in the upload form date picker
3. Browser console logs from the upload (especially the "📅 Date validation" log)

