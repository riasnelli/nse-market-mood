# How to Get Dhan API Debug Info

## Steps to Access Debug Information

1. **Open Browser Developer Console**
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Or `Cmd+Option+I` (Mac)
   - Or right-click → "Inspect" → "Console" tab

2. **Ensure Dhan API is Active**
   - Click the ⚙️ settings icon
   - Select "Dhan API" radio button
   - Make sure your credentials are saved
   - Click "Save Settings"

3. **Trigger a Data Fetch**
   - Click the "🔄 Refresh" button
   - Or wait for auto-refresh (every 30 seconds)
   - Or refresh the page (F5)

4. **Find the Error in Console**
   Look for these messages:
   ```
   API returned error: Error processing Dhan data: No indices data found in Dhan API response
   === Dhan API Debug Info ===
   ```

5. **Expand the Debug Object**
   - In the console, find the error message
   - Look for a `debug` object in the error response
   - Click the arrow (▶) to expand it
   - Or look for: `Full debug object: {...}`

6. **Copy the Debug Information**
   The debug object contains:
   - `rawResponse.type` - Type of response (object/array)
   - `rawResponse.isArray` - Whether it's an array
   - `rawResponse.keys` - Keys in the response object
   - `rawResponse.sample` - Sample of the raw data
   - `fullStructure` - Complete response structure

## Alternative: Use Console Commands

After the error appears, you can also run:

```javascript
// Get the last error response
const lastError = console.memory; // This won't work, use the method below instead

// Better: Check the Network tab
// 1. Go to Network tab in DevTools
// 2. Find the request to `/api/dhan-data`
// 3. Click on it
// 4. Go to "Response" tab
// 5. Copy the full response JSON
```

## What to Share

Please share:
1. The `fullStructure` value from the debug object
2. Or the complete response from Network tab → `/api/dhan-data` → Response
3. This will show the exact format Dhan API returns

## Quick Check

If you see this in console:
```
=== Dhan API Debug Info ===
Raw response type: object
Is Array: false
Response keys: [...]
Raw response sample: {...}
Full debug object: {...}
```

Expand the "Full debug object" and copy the `fullStructure` value.

