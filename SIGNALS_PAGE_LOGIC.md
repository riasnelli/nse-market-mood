# Signals Page - Current Logic Documentation

## Overview
The signals page displays trading signals generated from uploaded CSV data (bhavcopy and premarket). Signals can be generated with or without premarket data, and users can select different strategies to regenerate signals.

---

## 1. Page Initialization

### When Signals Page is Opened
- Location: `public/app.js` - `setActiveView('signals')` → calls `loadSignals()`
- Trigger: User clicks "SIGNALS" button in footer navigation

### Initial Setup
```javascript
// Line ~7850
requestAnimationFrame(() => {
    this.loadSignals();
});
```

---

## 2. Date Determination Logic (`loadSignals()`)

### Step 1: Check if date is provided
- If `date` parameter is provided, use it
- Otherwise, determine date automatically

### Step 2: Auto-select Strategy (if available)
```javascript
// Line ~7966
const strategyAnalysis = this.analyzeMarketConditionsAndRecommendStrategy();
if (strategyAnalysis && strategyAnalysis.strategyId) {
    this.selectedStrategy = strategyAnalysis.strategyId;
    localStorage.setItem('selectedStrategy', strategyAnalysis.strategyId);
}
```

### Step 3: Find Latest Data Date
Priority order:
1. **From `_dateMap`** (uploaded data summary)
   - Calls `getBestSignalsDate(dateMapEntries)`
   - Returns latest date with both bhav AND premarket (priority 1)
   - Or latest date with bhav only (priority 2)
   - Or latest date in dateMap (priority 3)

2. **From API** (fallback)
   - Calls `/api/signals?operation=latest`
   - Uses `latest_complete_date` from response

3. **Today's date** (final fallback)
   - Uses current date

### Step 4: Calculate Target Date for Signals
```javascript
// If we have latest data date (e.g., 24/12)
if (latestDataDate) {
    // Signals should be for next trading day after latest data
    targetDate = getNextTradingDay(latestDataDate); // e.g., 25/12
    
    // If calculated date is today and market is closed, go one more day
    if (targetDate === today && market is closed) {
        targetDate = getNextTradingDay(today); // e.g., 26/12
    }
} else {
    // No data found - use next trading day from today
    targetDate = getNextTradingDay(today);
}
```

### Step 5: Clear Cached Data
```javascript
this._signalsStatusData = {
    date: targetDate,
    signalsInfo: undefined,  // Cleared to force refresh
    dataAvailability: undefined,
    strategy: undefined,
    backendMessage: undefined,
    mode: undefined
};
```

---

## 3. API Call Flow

### Frontend Request
```javascript
// Line ~8066
let url = `/api/signals?date=${targetDate}&strategy=${this.selectedStrategy || 'momentum_gap'}`;
let response = await apiConfig.fetch(url);
```

### Backend API Handler (`api/signals.js`)

#### Step 1: Parse Request
- `date`: From query parameter or defaults to today
- `strategy`: From query parameter or auto-selected based on mood

#### Step 2: Auto-select Strategy (if not provided)
```javascript
if (!strategy) {
    const mood = await getCurrentMood();
    strategy = selectStrategyFromMood(mood);
}
```

#### Step 3: Adjust Date if Market Closed
```javascript
if (isToday && !req.query.date) {
    date = getNextTradingDay(today);
}
```

#### Step 4: Check Signals Store
- Queries `signals_store` collection: `{ date, strategy }`
- If found: Returns stored signals with status (READY | NO_MATCH | INSUFFICIENT_DATA | ERROR)

#### Step 5: Auto-Generate if Not Found
```javascript
// Always attempts to generate signals
const result = await generateSignalsForDate(date, strategy);
```

---

## 4. Signal Generation Logic (`generateSignalsForDate()`)

### Data Availability Check
```javascript
const dataCheck = await checkDataAvailability(date);
// Only requires bhavcopy - premarket is optional
if (!dataCheck.hasBhav) {
    return INSUFFICIENT_DATA status;
}
```

### Strategy Routing
```javascript
switch (strategy) {
    case 'momentum_gap':
        result = await generateSimpleMomentumGapSignals(date, strategy);
        break;
    case 'breakout':
        result = await generateBreakoutSignals(date, strategy);
        break;
    case 'mean_reversion':
        result = await generateMeanReversionSignals(date, strategy);
        break;
    case 'defensive':
        result = await generateDefensiveSignals(date, strategy);
        break;
    case 'volatility_play':
        result = await generateVolatilityPlaySignals(date, strategy);
        break;
}
```

### Signal Generation (Momentum Gap Example)

#### With Premarket Data:
1. Gets yesterday's bhavcopy data
2. Gets today's premarket data
3. Calculates gap percentage: `(premarketPrice - yesterdayClose) / yesterdayClose * 100`
4. Filters:
   - Gap >= 0.3%
   - Volume >= 100,000
   - Score >= 50
5. Calculates entry, target, stop-loss
6. Returns top 10 signals sorted by score

#### Without Premarket Data:
1. Gets yesterday's bhavcopy data only
2. Uses yesterday's momentum indicators:
   - `pChange` (percentage change)
   - Near high detection
   - Volume
   - Delivery percentage
3. Calculates momentum score based on yesterday's performance
4. Uses yesterday's close as entry estimate
5. Marks signals with `has_premarket: false`
6. Message: "preliminary signals... (premarket pending)"

---

## 5. Strategy-Specific Logic

### Momentum Gap
- **With premarket**: Gap-up >= 0.3%, near high, high volume
- **Without premarket**: Yesterday's momentum (pChange > 0), near high, high volume

### Breakout
- Filters momentum gap signals with volume >= 200,000
- Focuses on breakout patterns

### Mean Reversion
- **With premarket**: Negative gap (-5% to 0%), near low
- **Without premarket**: Yesterday's negative change (-5% to 0%), near low

### Defensive
- Only signals with score >= 70
- Conservative filters

### Volatility Play
- Gap >= 1.0% requirement
- Wider stops/targets (3x ATR)

---

## 6. Response Handling (Frontend)

### Success Response
```javascript
// Line ~8034
this.updateSignalsStatus({
    signalsInfo: {
        hasSignals: data.status === 'READY' && signals.length > 0,
        signals: data.signals || [],
        success: data.status !== 'ERROR',
        message: data.message
    }
});
```

### Display Signals
- Renders signal cards in `signalsContainer`
- Shows symbol, entry, target, stop-loss, score, reason
- Displays empty state if no signals

---

## 7. Strategy Selection & Regeneration

### Strategy Modal
- User clicks "Try other Strategies" link
- Modal shows 5 strategies:
  - Momentum Gap
  - Breakout
  - Mean Reversion
  - Defensive / Wait
  - Volatility Play

### Apply Strategy
```javascript
// Line ~3107
if (e.target.closest('#applyStrategyBtn')) {
    const finalSelectedId = selectedOption.dataset.strategy;
    this.selectedStrategy = finalSelectedId;
    localStorage.setItem('selectedStrategy', finalSelectedId);
    
    // Regenerate signals with new strategy
    if (this.currentView === 'signals') {
        this.loadSignals();  // Reloads with new strategy
    }
}
```

### Regeneration Flow
1. User selects strategy → clicks "Apply Strategy"
2. `selectedStrategy` updated in localStorage
3. `loadSignals()` called (no date parameter)
4. Date determination runs again
5. API called with new strategy: `/api/signals?date=${targetDate}&strategy=${newStrategy}`
6. Signals regenerated and displayed

---

## 8. Status Panel Display (`updateSignalsStatus()`)

### Date Display
- Shows `targetDate` dynamically
- Format: "YYYY-MM-DD"

### Engine Status
- **Active**: Green - "Active — X signals generated."
- **No signals**: Orange - "No signals — [message]"
- **Error**: Red - "Temporarily unavailable — [message]"

### Strategy Display
- Shows selected strategy name
- Indicates if "strategy-only mode" (no signals)

---

## 9. Data Flow Summary

```
User Opens Signals Page
    ↓
loadSignals() called
    ↓
Determine targetDate:
  - Find latest data date (24/12)
  - Calculate next trading day (25/12)
  - If market closed, go one more day (26/12)
    ↓
Clear cached data
    ↓
Call API: GET /api/signals?date=25/12&strategy=momentum_gap
    ↓
Backend checks signals_store
    ↓
If not found → Auto-generate:
  - Check data availability (bhavcopy required, premarket optional)
  - Route to strategy function
  - Generate signals (with or without premarket)
  - Save to signals_store
    ↓
Return response with signals
    ↓
Frontend displays signals
    ↓
User selects different strategy
    ↓
loadSignals() called again with new strategy
    ↓
Signals regenerated and displayed
```

---

## 10. Key Variables

### Frontend (`public/app.js`)
- `this.selectedStrategy`: Current strategy (from localStorage or auto-selected)
- `this._dateMap`: Map of available dates and their data
- `this._signalsStatusData`: Cached signals status data
- `this.lastMarketStatus`: Last known market status (for closed market detection)

### Backend (`api/signals.js`, `api/lib/signals/generateSignals.js`)
- `date`: Target date for signals (next trading day after latest data)
- `strategy`: Strategy name (momentum_gap, breakout, mean_reversion, defensive, volatility_play)
- `hasPremarket`: Boolean flag indicating if premarket data is available
- `signals_store`: MongoDB collection storing generated signals

---

## 11. Current Behavior

### When You Have 24/12 Data:
1. Latest data date: 24/12
2. Target date for signals: 25/12 (next trading day)
3. If 25/12 is today and market closed: 26/12
4. Signals generated for target date
5. Works with or without premarket data

### When Market is Closed:
1. Detects market is closed (from `lastMarketStatus`)
2. Uses next trading day automatically
3. Generates signals for tomorrow

### Strategy Selection:
1. User opens strategy modal
2. Selects strategy
3. Clicks "Apply Strategy"
4. Signals regenerate with new strategy
5. Same date, different strategy logic applied

---

## 12. API Endpoints Used

1. **GET `/api/signals?date=YYYY-MM-DD&strategy=STRATEGY`**
   - Fetches signals for date/strategy
   - Auto-generates if not found

2. **GET `/api/signals?operation=latest`**
   - Gets latest available date from database

3. **GET `/api/data?action=dates`**
   - Gets list of available dates (populates `_dateMap`)

---

## 13. Database Collections

- `signals_store`: Stores generated signals
  - Fields: `date`, `strategy`, `status`, `signals`, `signal_count`, `message`
- `daily_bhavcopy`: Yesterday's bhavcopy data
- `premarket_data`: Today's premarket data
- `uploaded_data`: Uploaded CSV data (bhav, premarket, indices)

---

## Notes

- Signals can be generated **without premarket data** using yesterday's bhavcopy only
- When premarket becomes available, signals can be **regenerated** for more accurate entry prices
- All 5 strategies work with or without premarket data
- Strategy selection from modal **always regenerates** signals
- Date is **always** next trading day after latest data date

