# Key Functions Reference

## 1. getNextTradingDay() Function

### Frontend Implementation
**Location**: `public/app.js` (line ~7923)

```javascript
/**
 * Get next trading day (skip weekends)
 */
getNextTradingDay(todayDate) {
    const date = new Date(todayDate);
    date.setDate(date.getDate() + 1);
    // Skip weekends - if tomorrow is Saturday, go to Monday
    while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
    }
    return date.toISOString().split('T')[0];
}
```

### Backend Implementation
**Location**: `api/lib/signals/generateSignals.js` (line ~37)

```javascript
/**
 * Get next trading day (skip weekends)
 * @param {string} todayDate - Date in YYYY-MM-DD format
 * @returns {string} - Next trading day in YYYY-MM-DD format
 */
function getNextTradingDay(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() + 1);
  // Skip weekends - if tomorrow is Saturday, go to Monday
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().split('T')[0];
}
```

### Usage Examples

```javascript
// Example 1: Friday to Monday
getNextTradingDay('2025-12-19') // Friday
// Returns: '2025-12-22' (Monday, skips Saturday & Sunday)

// Example 2: Thursday to Friday
getNextTradingDay('2025-12-18') // Thursday
// Returns: '2025-12-19' (Friday)

// Example 3: Saturday to Monday
getNextTradingDay('2025-12-20') // Saturday
// Returns: '2025-12-22' (Monday, skips Sunday)
```

### Logic
1. Takes input date string (YYYY-MM-DD format)
2. Creates Date object and adds 1 day
3. Checks if the day is Saturday (6) or Sunday (0)
4. If weekend, keeps adding days until it's a weekday (Monday-Friday)
5. Returns date in YYYY-MM-DD format

### Notes
- **Does NOT skip market holidays** - only skips weekends
- Works with ISO date strings (YYYY-MM-DD)
- Returns next weekday (Monday-Friday)

---

## 2. checkDataAvailability() Function

### Location
**File**: `api/lib/signals/generateSignals.js`  
**Line**: ~844

### Full Implementation

```javascript
/**
 * Check if required datasets are available for a date
 * 
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} - { hasBhav: boolean, hasPremarket: boolean, missingFiles: string[] }
 */
async function checkDataAvailability(date) {
  const yesterdayDate = getYesterdayDate(date);
  const missingFiles = [];
  
  let hasBhav = false;
  let hasPremarket = false;

  try {
    // Check bhavcopy (yesterday's date)
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const bhavcopyCount = await bhavcopyCollection.countDocuments({ 
      date: yesterdayDate,
      series: 'EQ'
    });
    
    if (bhavcopyCount === 0) {
      // Check uploadedBhav as fallback
      const uploadedBhavCollection = await getUploadedDataCollection('bhav');
      const uploadedBhavCount = await uploadedBhavCollection.countDocuments({ date: yesterdayDate });
      hasBhav = uploadedBhavCount > 0;
    } else {
      hasBhav = true;
    }
    
    if (!hasBhav) {
      missingFiles.push(`bhavcopy for ${yesterdayDate}`);
    }
  } catch (error) {
    console.error('Error checking bhavcopy data:', error);
    missingFiles.push(`bhavcopy for ${yesterdayDate}`);
  }

  try {
    // Check premarket (today's date)
    const premarketCollection = await getPreMarketDataCollection();
    const premarketCount = await premarketCollection.countDocuments({ date });
    
    if (premarketCount === 0) {
      // Check uploadedPreMarket as fallback
      const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
      const uploadedPremarketCount = await uploadedPremarketCollection.countDocuments({ date });
      hasPremarket = uploadedPremarketCount > 0;
    } else {
      hasPremarket = true;
    }
    
    if (!hasPremarket) {
      missingFiles.push(`premarket for ${date}`);
    }
  } catch (error) {
    console.error('Error checking premarket data:', error);
    missingFiles.push(`premarket for ${date}`);
  }

  return {
    hasBhav,
    hasPremarket,
    missingFiles
  };
}
```

### Function Details

#### Parameters
- **`date`** (string): Target date in YYYY-MM-DD format (e.g., '2025-12-25')

#### Returns
Promise that resolves to an object:
```javascript
{
  hasBhav: boolean,        // true if bhavcopy data exists
  hasPremarket: boolean,   // true if premarket data exists
  missingFiles: string[]   // Array of missing file descriptions
}
```

### Logic Flow

1. **Calculate Yesterday's Date**
   - Uses `getYesterdayDate(date)` to get previous trading day
   - Skips weekends automatically

2. **Check Bhavcopy Data** (Required)
   - Checks `daily_bhavcopy` collection for yesterday's date
   - Filters by `series: 'EQ'` (Equity only)
   - If not found, checks `uploaded_data` collection (type: 'bhav')
   - If still not found, adds to `missingFiles` array

3. **Check Premarket Data** (Optional)
   - Checks `premarket_data` collection for target date
   - If not found, checks `uploaded_data` collection (type: 'premarket')
   - If not found, adds to `missingFiles` array (but doesn't fail)

4. **Return Results**
   - Returns boolean flags for each data type
   - Returns array of missing file descriptions

### Usage Example

```javascript
// Check data availability for 2025-12-25
const dataCheck = await checkDataAvailability('2025-12-25');

// Result if bhavcopy exists but premarket doesn't:
{
  hasBhav: true,
  hasPremarket: false,
  missingFiles: ['premarket for 2025-12-25']
}

// Result if both exist:
{
  hasBhav: true,
  hasPremarket: true,
  missingFiles: []
}

// Result if bhavcopy is missing:
{
  hasBhav: false,
  hasPremarket: false,
  missingFiles: ['bhavcopy for 2025-12-24']
}
```

### Database Collections Checked

1. **Bhavcopy** (yesterday's date):
   - `daily_bhavcopy` collection
   - `uploaded_data` collection (type: 'bhav')

2. **Premarket** (target date):
   - `premarket_data` collection
   - `uploaded_data` collection (type: 'premarket')

### Error Handling

- **Try-Catch Blocks**: Each data check is wrapped in try-catch
- **Error Logging**: Errors are logged to console
- **Graceful Failure**: Missing files are added to array, function doesn't throw

### Important Notes

1. **Bhavcopy is Required**: If `hasBhav === false`, signal generation will fail
2. **Premarket is Optional**: If `hasPremarket === false`, signals can still be generated
3. **Date Logic**: 
   - Bhavcopy checked for **yesterday's date** (previous trading day)
   - Premarket checked for **target date** (today)
4. **Fallback Collections**: Checks both processed collections and uploaded_data collections

---

## 3. getYesterdayDate() Function

### Location
**File**: `api/lib/signals/generateSignals.js`  
**Line**: ~829

### Implementation

```javascript
/**
 * Get yesterday's date (skip weekends)
 */
function getYesterdayDate(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}
```

### Usage
Used by `checkDataAvailability()` to find the previous trading day for bhavcopy data lookup.

### Example
```javascript
getYesterdayDate('2025-12-22') // Monday
// Returns: '2025-12-19' (Friday, skips weekend)

getYesterdayDate('2025-12-20') // Saturday
// Returns: '2025-12-19' (Friday, skips Sunday)
```

---

## Summary

### getNextTradingDay()
- **Purpose**: Calculate next trading day (skips weekends)
- **Input**: Date string (YYYY-MM-DD)
- **Output**: Next weekday date string
- **Used for**: Determining target date for signal generation

### checkDataAvailability()
- **Purpose**: Check if required data files exist in database
- **Input**: Target date (YYYY-MM-DD)
- **Output**: Object with availability flags and missing files list
- **Used for**: Validating data before signal generation
- **Key Point**: Only bhavcopy is required; premarket is optional

### getYesterdayDate()
- **Purpose**: Calculate previous trading day (skips weekends)
- **Input**: Date string (YYYY-MM-DD)
- **Output**: Previous weekday date string
- **Used for**: Finding bhavcopy data date

