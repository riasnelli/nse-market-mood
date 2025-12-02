# Footer Data Source Display - Fix

## Issue

The footer data source info was hardcoded to always show "NSE India • Updates every 30 sec. during market hrs." regardless of which data source was actually selected in settings.

When user selected "Uploaded CSV data" in settings, the footer did not update to reflect this change.

## Fix Applied

### Updated Function: `updateDataSourceDisplay(source, data)`

**Before:**
```javascript
updateDataSourceDisplay(source, data = null) {
    const dataSource = document.getElementById('dataSource');
    const updateInfo = document.getElementById('updateInfo');

    // Always show minimal message: "NSE India • Updates every 30 sec. during market hrs."
    if (dataSource) {
        dataSource.textContent = 'NSE India';
    }
    if (updateInfo) {
        updateInfo.textContent = 'Updates every 30 sec. during market hrs.';
    }
}
```

**After:**
```javascript
updateDataSourceDisplay(source, data = null) {
    const dataSource = document.getElementById('dataSource');
    const updateInfo = document.getElementById('updateInfo');

    if (!dataSource || !updateInfo) return;

    // Update based on data source
    if (source === 'uploaded' || source === 'database') {
        // Show uploaded CSV data info
        const fileName = data?.fileName || 'Uploaded CSV';
        const date = data?.date || '';
        
        dataSource.textContent = fileName;
        updateInfo.textContent = date ? `Data from ${date}` : 'Static uploaded data';
    } else {
        // Show NSE India (API) info
        dataSource.textContent = 'NSE India';
        updateInfo.textContent = 'Updates every 30 sec. during market hrs.';
    }
}
```

## How It Works

### Data Source Detection

The function now checks the `source` parameter:

1. **Uploaded CSV Data** (`source === 'uploaded'` or `source === 'database'`)
   - Shows: `[filename] • Data from [date]`
   - Example: `indices_data.csv • Data from 2024-12-02`
   - If no filename: Shows `Uploaded CSV • Data from [date]`
   - If no date: Shows `Uploaded CSV • Static uploaded data`

2. **NSE India API** (`source === 'api'`)
   - Shows: `NSE India • Updates every 30 sec. during market hrs.`

### When Footer Updates

The footer updates automatically when:

1. **Page loads**: Initial data source is detected and displayed
2. **User changes settings**: 
   - User goes to Menu → Settings
   - Selects different data source (NSE India or Uploaded CSV)
   - Clicks "Save Settings"
   - `reloadWithNewAPI()` is called
   - `loadData()` is called with new source
   - `updateDataSourceDisplay()` is called with correct source
   - Footer updates instantly

3. **Data is uploaded**:
   - User uploads new CSV file
   - Settings automatically switch to "uploaded" source
   - Footer updates to show the uploaded file info

## Examples

### Example 1: NSE India Selected
```
Footer shows:
┌─────────────────────────────────────────────────────┐
│ NSE India • Updates every 30 sec. during market hrs.│
└─────────────────────────────────────────────────────┘
```

### Example 2: Uploaded CSV Selected
```
Footer shows:
┌─────────────────────────────────────────────────────┐
│ nse_indices.csv • Data from 2024-12-02              │
└─────────────────────────────────────────────────────┘
```

### Example 3: Uploaded CSV (No Filename)
```
Footer shows:
┌─────────────────────────────────────────────────────┐
│ Uploaded CSV • Data from 2024-12-02                 │
└─────────────────────────────────────────────────────┘
```

## Testing

### How to Test:

1. **Start with NSE India**:
   - Open app
   - Footer should show: "NSE India • Updates every 30 sec. during market hrs."

2. **Upload CSV**:
   - Click "Upload" button
   - Upload a CSV file with date
   - Footer should update to: "[filename] • Data from [date]"

3. **Switch to NSE India**:
   - Open Menu → Settings
   - Select "NSE India" as active API
   - Save settings
   - Footer should update back to: "NSE India • Updates every 30 sec. during market hrs."

4. **Switch back to Uploaded CSV**:
   - Open Menu → Settings
   - Select "Uploaded Data" as active API
   - Save settings
   - Footer should update to: "[filename] • Data from [date]"

## Code Flow

```
User selects data source in Settings
         ↓
saveCurrentSettings()
         ↓
reloadWithNewAPI()
         ↓
loadData()
         ↓
Check activeApi setting
         ↓
   ┌──────────────┐
   │ If 'uploaded'│ or │ If 'api' │
   └──────────────┘    └──────────┘
         ↓                   ↓
Load uploaded data    Load NSE India data
         ↓                   ↓
updateDataSourceDisplay('uploaded', data)
         │             or
updateDataSourceDisplay('api')
         ↓
Footer updates with correct info
```

## Files Modified

- ✅ `public/app.js` - Updated `updateDataSourceDisplay()` function

## Benefits

1. **Clear indication** - Users now see which data source is active
2. **No confusion** - Footer accurately reflects current data source
3. **File info** - When using uploaded CSV, shows filename and date
4. **Real-time updates** - Footer updates immediately when switching sources
5. **Consistent UX** - Footer info matches the selected data source in settings

---

**Status**: ✅ Fixed and Deployed
**Commit**: 3adb940
**Date**: December 2, 2024
