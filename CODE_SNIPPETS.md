# Code Snippets: Mode Resolution & Frontend Handling

## 1. Backend: `/api/signals` Handler - Mode Resolution Part

**File:** `api/signals.js` (lines 664-823)

```javascript
// GET /api/signals?date=YYYY-MM-DD&strategy=momentum_gap&modeOverride=EOD|PREMARKET|LIVE&marketStatus=...
let targetDate = req.query.date || new Date().toISOString().split('T')[0];
let strategy = req.query.strategy;
const modeOverride = req.query.modeOverride; // Only present when explicitly set (not AUTO)
const includeDebug = req.query.debug === '1' || process.env.NODE_ENV !== 'production';

// Recompute market status using tradingCalendar - do NOT trust frontend
const today = getTodayIST();
const computedMarketOpen = isTradingDay(today) && (() => {
  const ist = new Date();
  const utc = ist.getTime() + (ist.getTimezoneOffset() * 60000);
  const istOffset = 5.5 * 60 * 60000;
  const istTime = new Date(utc + istOffset);
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  // Market hours: 9:15 AM - 3:30 PM IST (555-930 minutes)
  return timeMinutes >= 555 && timeMinutes < 930;
})();

// Get market status from query (for diagnostic only, but recompute isOpen)
let marketStatus = { isOpen: computedMarketOpen, timestamp: new Date().toISOString() };
if (req.query.marketStatus) {
  try {
    const clientMarketStatus = JSON.parse(req.query.marketStatus);
    // Use client status as diagnostic, but override isOpen with computed value
    marketStatus = {
      ...clientMarketStatus,
      isOpen: computedMarketOpen, // Always use computed value
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    // If parsing fails, use computed value
    marketStatus = { isOpen: computedMarketOpen, timestamp: new Date().toISOString() };
  }
}

// User override from query params - only accept valid modes
const validModes = ['EOD', 'PREMARKET', 'LIVE'];
const overrideMode = modeOverride && validModes.includes(modeOverride.toUpperCase()) 
  ? modeOverride.toUpperCase() 
  : undefined; // Treat invalid/undefined as AUTO

const userOverride = {
  mode: overrideMode,
  strategy: strategy
};

// Resolve signals context (this determines signalDate, refEodDate, premarketDate, mode)
const context = await resolveSignalsContext({
  targetDate,
  today,
  marketStatus,
  userOverride
});

const signalDate = context.signalDate;
const refEodDate = context.refEodDate;
const premarketDate = context.premarketDate;
const detectedMode = context.mode;

// Hard guard: NEVER allow MODE_NONE to reach strategy engines
// If mode is MODE_NONE but EOD data exists, force EOD mode
let finalMode = detectedMode;
const resolvedBy = overrideMode ? `override:${overrideMode.toLowerCase()}` : 'auto';
if (finalMode === MODE_NONE && refEodDate) {
  console.warn(`⚠️ [SIGNALS API] MODE_NONE detected but EOD data exists (refEodDate: ${refEodDate}), forcing MODE_EOD`);
  finalMode = MODE_EOD;
} else if (finalMode === MODE_NONE) {
  // No data available - return INSUFFICIENT_DATA
  return res.status(200).json({
    success: true,
    engineStatus: 'insufficient_data',
    requested: { date: targetDate, strategy, modeOverride: overrideMode || undefined },
    context: {
      signalDate: signalDate || null,
      refEodDate: refEodDate || null,
      premarketDate: premarketDate || null,
      hasBhav: !!refEodDate,
      hasPremarket: !!premarketDate,
      missingFiles: context.missingFiles || []
    },
    signals: [],
    meta: {
      reason: context.reason || 'Insufficient data available for signal generation',
      mode: null // Don't return MODE_NONE in response
    },
    resolvedMode: null,
    resolvedBy: resolvedBy,
    computedMarketOpen: computedMarketOpen
  });
}

// Verify mode is one of the supported modes
const supportedModeConstants = [MODE_EOD, MODE_PREM, MODE_LIVE];
if (!supportedModeConstants.includes(finalMode)) {
  console.error(`❌ [SIGNALS API] Invalid mode detected: ${finalMode}, forcing MODE_EOD`);
  finalMode = MODE_EOD;
}
```

## 2. Backend: Response JSON Structure

**File:** `api/signals.js` (lines 886-922 for stored doc, 957-1014 for generated signals)

### Successful Response (READY/NO_MATCH):
```javascript
{
  success: true,
  engine: 'OK',
  targetDate: '2025-12-29',
  signalDate: '2025-12-29',
  refDate: '2025-12-26',
  strategy: 'momentum_gap',
  mode: 'MODE_EOD',  // or MODE_PREM, MODE_LIVE
  modeDisplay: 'EOD',
  modeLabel: 'EOD (Watchlist)',
  status: 'READY',  // or 'NO_MATCH'
  signal_count: 5,
  signals: [...],
  hasSignals: true,
  message: 'Signals generated automatically',
  missingFiles: null,  // or ['premarket for 2025-12-29']
  context: {
    mode: 'MODE_EOD',
    signalDate: '2025-12-29',
    refEodDate: '2025-12-26',
    premarketDate: null,
    marketOpen: false,
    marketTimestamp: '2025-12-27T14:30:00.000Z',
    reason: 'Signals generated'
  },
  dataUsed: {
    refEodDate: '2025-12-26',
    premarketDate: null,
    mode: 'MODE_EOD',
    signalDate: '2025-12-29',
    marketOpen: false,
    marketTimestamp: '2025-12-27T14:30:00.000Z'
  },
  usedDates: {
    targetDate: '2025-12-29',
    signalDate: '2025-12-29',
    refDate: '2025-12-26',
    eodDate: '2025-12-26',
    preMDate: null
  },
  resolvedMode: 'MODE_EOD',
  resolvedBy: 'auto',  // or 'override:eod'
  computedMarketOpen: false
}
```

### INSUFFICIENT_DATA Response:
```javascript
{
  success: true,
  engine: 'OK',
  targetDate: '2025-12-29',
  signalDate: '2025-12-29',
  refDate: '2025-12-26',
  strategy: 'momentum_gap',
  mode: 'MODE_EOD',
  status: 'INSUFFICIENT_DATA',
  signal_count: 0,
  signals: [],
  hasSignals: false,
  message: 'Insufficient data available for this date.',
  missingFiles: ['premarket for 2025-12-29'],  // Array of missing files
  context: {
    mode: 'MODE_EOD',
    signalDate: '2025-12-29',
    refEodDate: '2025-12-26',
    premarketDate: null,
    marketOpen: false,
    marketTimestamp: '2025-12-27T14:30:00.000Z',
    reason: 'Required CSV data not available'
  },
  dataUsed: {
    refEodDate: '2025-12-26',
    premarketDate: null,
    mode: 'MODE_EOD',
    signalDate: '2025-12-29',
    marketOpen: false,
    marketTimestamp: '2025-12-27T14:30:00.000Z'
  },
  usedDates: {
    targetDate: '2025-12-29',
    signalDate: '2025-12-29',
    refDate: '2025-12-26',
    eodDate: '2025-12-26',
    preMDate: null
  },
  resolvedMode: 'MODE_EOD',
  resolvedBy: 'auto',
  computedMarketOpen: false
}
```

## 3. Frontend: `loadSignals()` Function - Mode & MissingFiles Handling

**File:** `public/app.js` (lines 8310-8651)

```javascript
async loadSignals(signalDate, strategy = null) {
  // ... setup code ...
  
  // Only send modeOverride when explicitly set to EOD, PREMARKET, or LIVE
  // Do NOT send modeOverride=AUTO - backend will use AUTO behavior when param is missing
  const validModes = ['EOD', 'PREMARKET', 'LIVE'];
  const shouldSendModeOverride = userOverrideMode && validModes.includes(userOverrideMode.toUpperCase());
  
  let url = `/api/signals?date=${targetDate}&strategy=${selectedStrategy}`;
  if (shouldSendModeOverride) {
    url += `&modeOverride=${encodeURIComponent(userOverrideMode)}`;
  }
  url += `&marketStatus=${marketStatusParam}`;
  
  // Fetch API response
  const response = await apiConfig.fetch(url);
  const data = await response.json();
  
  // Handle INSUFFICIENT_DATA with proper UI messages
  if (data.status === 'INSUFFICIENT_DATA') {
    const usedDates = data.usedDates || { targetDate, signalDate: data.signalDate || targetDate, refDate: data.refDate };
    const missingFiles = data.missingFiles || [];
    
    // Check if premarket is missing for signalDate
    const isPremarketMissing = missingFiles.some(f => f.includes('premarket') && f.includes(targetDate));
    
    if (isPremarketMissing && this.lastMarketStatus && this.lastMarketStatus.isOpen) {
      // Market is open, premarket missing - show message without changing date
      signalsEmpty.style.display = 'block';
      signalsEmpty.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 15px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <h3 style="color: #f59e0b; margin-bottom: 10px;">Premarket Not Uploaded</h3>
          <p style="color: #666; font-size: 0.95rem; line-height: 1.5;">Premarket data not uploaded for ${targetDate}.</p>
          <p style="color: #666; font-size: 0.85rem; margin-top: 15px;">Please upload premarket CSV to generate signals for today.</p>
        </div>
      `;
      
      this.updateSignalsStatus({
        date: usedDates.signalDate || targetDate,
        signalsInfo: {
          hasSignals: false,
          signals: [],
          success: false,
          message: `Premarket not uploaded for ${targetDate}`
        },
        backendMessage: data.message,
        mode: data.mode || 'MODE_EOD',
        modeDisplay: data.modeDisplay || (data.modeLabel ? data.modeLabel.split('(')[0].trim() : 'EOD'),
        modeLabel: data.modeLabel || (data.modeDisplay === 'EOD' ? 'EOD (Watchlist)' : data.modeDisplay === 'PREMARKET' ? 'PREMARKET (Confirmed)' : data.modeDisplay === 'LIVE' ? 'LIVE (Adaptive)' : 'EOD (Watchlist)'),
        modeDescription: data.modeLabel ? data.modeLabel.split('(')[1]?.replace(')', '') : '',
        modeInfo: { mode: data.mode, reason: data.message },
        diagnostics: data.diagnostics,
        rejectStats: data.rejectStats,
        filtersUsed: data.filtersUsed,
        topRejectionReasons: data.rejectStats,
        refDate: data.dataUsed?.refEodDate || usedDates.refDate,
        usedDates: {
          eodDate: data.dataUsed?.refEodDate || usedDates.eodDate,
          preMDate: data.dataUsed?.premarketDate || usedDates.preMDate
        },
        dataUsed: data.dataUsed,
        strategy: selectedStrategy
      });
      signalsLoading.style.display = 'none';
      return;
    }
  }
  
  // Update status with signals info
  const usedDates = data.usedDates || { targetDate, signalDate: data.signalDate || targetDate, refDate: data.refDate };
  this.updateSignalsStatus({
    date: usedDates.signalDate || targetDate,
    signalsInfo: {
      hasSignals: data.status === 'READY' && (data.signals && data.signals.length > 0),
      signals: data.signals || [],
      success: data.status !== 'ERROR',
      message: data.message
    },
    backendMessage: data.message,
    mode: data.mode || ((data.status === 'READY' && data.signals && data.signals.length > 0) ? 'signals' : 'strategy-only'),
    modeDisplay: data.modeDisplay,
    modeDescription: data.modeDescription,
    modeInfo: data.modeInfo,
    diagnostics: data.diagnostics,
    topRejectionReasons: data.topRejectionReasons,
    refDate: usedDates.refDate,
    usedDates: usedDates,
    strategy: selectedStrategy
  });
  
  // ... handle other statuses (READY, NO_MATCH, etc.) ...
  
  // Handle INSUFFICIENT_DATA status (additional handling further down)
  else if (status === 'INSUFFICIENT_DATA') {
    // Missing required CSV files
    console.log('⚠️ Insufficient data for signal generation');
    signalsEmpty.style.display = 'flex';
    signalsEmpty.style.flexDirection = 'column';
    signalsEmpty.style.justifyContent = 'center';
    signalsEmpty.style.alignItems = 'center';
    signalsEmpty.style.minHeight = '50vh';
    signalsContainer.style.display = 'none';
    
    // ... render insufficient data UI ...
  }
}
```

## Key Points:

1. **Backend Mode Resolution:**
   - Recomputes `marketStatus.isOpen` server-side (never trusts frontend)
   - Normalizes `modeOverride` to only accept 'EOD', 'PREMARKET', 'LIVE'
   - Uses `resolveSignalsContext()` to determine mode
   - Hard guard: NEVER allows `MODE_NONE` to reach strategy engines
   - If `MODE_NONE` detected but EOD data exists → force `MODE_EOD`
   - Adds debug fields: `resolvedMode`, `resolvedBy`, `computedMarketOpen`

2. **Frontend Handling:**
   - Only sends `modeOverride` when explicitly set (not for AUTO)
   - Reads `data.status`, `data.mode`, `data.missingFiles` from response
   - Sets UI state via `updateSignalsStatus()` with mode, missingFiles, etc.
   - Shows "Insufficient Data" UI when `status === 'INSUFFICIENT_DATA'`
   - Handles premarket missing case specially when market is open

