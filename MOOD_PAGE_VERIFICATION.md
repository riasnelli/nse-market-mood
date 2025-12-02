# Mood Page Verification Guide

## What to Check on Live Site

Your Mood page is already correctly structured in the code. Here's what you should see when you visit https://nse-market-mood-git-main-muhammed-rias-as-projects.vercel.app/

### Expected Layout (Top to Bottom):

#### 1. Mood Box ✅
- [ ] Shows mood emoji (😊 bullish, 😐 neutral, 😢 bearish)
- [ ] Shows mood text ("Bullish", "Neutral", "Bearish")
- [ ] Shows score bar with percentage fill
- [ ] Shows score text (e.g., "65/100")

#### 2. Four Major Indices (2x2 Grid) ✅
- [ ] **NIFTY 50** - Top left
- [ ] **NIFTY BANK** - Top right
- [ ] **NIFTY IT** - Bottom left
- [ ] **INDIA VIX** - Bottom right

Each card should show:
- Index name
- Current value
- Change value (in points)
- Change percentage (with color: green for positive, red for negative)

#### 3. All Indices Section ✅
- [ ] Section header "All Indices"
- [ ] Toggle buttons (Card view / Table view)
- [ ] All remaining indices displayed (excluding the 4 main ones)

**Card View:**
- Grid layout with 2-4 cards per row (responsive)
- Each card shows same info as main indices

**Table View:**
- Scrollable table
- Columns: #, Index Name, Value, Change

#### 4. Market Breadth ✅
- [ ] Title "Market Breadth"
- [ ] Advances count (in green)
- [ ] Declines count (in red)

#### 5. Data Source Info ✅
- [ ] Shows "NSE India" or "Uploaded Data • [filename]"
- [ ] Shows update frequency info

## How to Test Data Sources

### Test 1: NSE India (Live Data)
1. Go to Settings (Menu → Settings)
2. Select "NSE India" as active API
3. Save settings
4. Return to Mood page (click Mood button in footer)
5. Should see:
   - Live NSE data
   - Auto-refresh every 30 seconds (during market hours)
   - Data source shows "NSE India"

### Test 2: Uploaded CSV Data
1. Go to Upload (Upload button in footer)
2. Upload a CSV file with date
3. Go to Settings (Menu → Settings)
4. Select "Uploaded Data" as active API
5. Select the uploaded date
6. Save settings
7. Return to Mood page
8. Should see:
   - Data from your uploaded CSV
   - No auto-refresh (static data)
   - Data source shows "Uploaded Data • [filename]"
   - Calendar icon appears in "All Indices" section

## Common Issues & Solutions

### Issue: Only see "Loading..." or "No data"
**Solution:**
1. Check if market is open (for NSE India)
2. Check if data was successfully uploaded (for CSV)
3. Check browser console for errors (F12)
4. Try hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Issue: Main indices not showing
**Possible causes:**
1. API not responding - check console
2. Data format mismatch - verify CSV format
3. Index names don't match - CSV should have exactly:
   - "NIFTY 50" or "Nifty 50"
   - "NIFTY BANK" or "Nifty Bank"
   - "NIFTY IT" or "Nifty IT"
   - "INDIA VIX" or "India VIX"

### Issue: All indices section not showing
**Check:**
1. Do you have more than 4 indices in total?
2. If only 4 indices exist, section will be hidden (correct behavior)

### Issue: Wrong data source being used
**Solution:**
1. Go to Settings (Menu → Settings)
2. Check which API is selected as "Active"
3. Make sure it's saved
4. Refresh the Mood page

## Code References

If you need to debug further, here are the key code locations:

### HTML Structure
File: `public/index.html`
- Mood box: Lines 29-40
- Main indices grid: Line 42
- All indices section: Lines 46-96
- Market breadth: Lines 98-110

### JavaScript Logic
File: `public/app.js`
- Data loading: Lines 536-733 (`loadData()` function)
- Index display: Lines 979-1134 (`updateIndices()` function)
- Card view: Lines 1196-1259 (`renderIndicesCards()` function)
- Table view: Lines 1261-1330 (`renderIndicesTable()` function)

### Data Source Selection
File: `public/app.js`, Line 540
```javascript
const activeApi = window.settingsManager?.settings?.activeApi;
if (activeApi === 'uploaded') {
    // Load from uploaded CSV
} else {
    // Load from NSE India API
}
```

## Expected Behavior Summary

✅ **Mood page correctly shows:**
1. Mood indicator based on market data
2. 4 major NSE indices in a prominent 2x2 grid
3. All other indices in card or table format (user's choice)
4. Market breadth (advances/declines)
5. Data from selected source (NSE or uploaded CSV)

✅ **Data source switching works:**
- Settings → Select API → Save → Mood page updates

✅ **View modes work:**
- Card view (default) - grid layout
- Table view - compact table

## Next Steps

After verifying the Mood page works correctly, we can move on to enhancing other features like:
- Strategy selection improvements
- AI-powered insights
- Historical data comparison
- Custom indicators
- Performance tracking

---

**Current Status**: Mood page is fully implemented and should be working correctly on your live site. If you see any specific issues, please provide:
1. Screenshot of what you're seeing
2. Browser console errors (F12 → Console tab)
3. Which data source you're using (NSE or uploaded CSV)
