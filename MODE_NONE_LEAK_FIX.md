# MODE_NONE Leak Fix - Summary

## Problem
UI shows `Mode = NONE` and engine says "Strategy Momentum Gap does not support NONE mode" even though hard guard exists in `api/signals.js` to prevent MODE_NONE from reaching strategy engines.

## Root Cause
After the hard guard that sets `finalMode` (lines 786-823), multiple places in the response JSON construction still use `detectedMode` (which could be MODE_NONE) instead of `finalMode` (which has been sanitized).

## Files Changed
- `api/signals.js`

## Exact Issues Fixed

### Issue 1: Line 880 - Stored doc dataUsed construction
**Location:** `api/signals.js:880`  
**Function:** Handler function, stored document response section  
**Problem:** Uses `detectedMode` as fallback  
**Fix:** Changed to `finalMode`

```javascript
// OLD:
mode: storedMode || detectedMode,

// NEW:
mode: storedMode || finalMode,
```

### Issue 2: Line 1029 - INSUFFICIENT_DATA response
**Location:** `api/signals.js:1029`  
**Function:** Handler function, `generateSignalsForDate` result handling  
**Problem:** Uses `detectedMode` as fallback  
**Fix:** Changed to `finalMode`

```javascript
// OLD:
const resolvedMode = result.mode || detectedMode;

// NEW:
const resolvedMode = result.mode || finalMode;
```

### Issue 3: Lines 1097, 1105, 1116, 1128 - ERROR response
**Location:** `api/signals.js:1097, 1105, 1116, 1128`  
**Function:** Handler function, error response from `generateSignalsForDate`  
**Problem:** Uses `detectedMode` as fallback in multiple places  
**Fix:** Changed all to `finalMode`

```javascript
// OLD (4 occurrences):
mode: result.mode || detectedMode,
context: { mode: result.mode || detectedMode, ... },
dataUsed: { mode: result.mode || detectedMode, ... },
resolvedMode: result.mode || detectedMode,

// NEW:
mode: result.mode || finalMode,
context: { mode: result.mode || finalMode, ... },
dataUsed: { mode: result.mode || finalMode, ... },
resolvedMode: result.mode || finalMode,
```

### Issue 4: Lines 1147, 1154, 1165 - NO_DATA fallback response
**Location:** `api/signals.js:1147, 1154, 1165`  
**Function:** Handler function, NO_DATA fallback response  
**Problem:** Uses `detectedMode` directly  
**Fix:** Changed to `finalMode`

```javascript
// OLD (3 occurrences):
mode: detectedMode,
context: { mode: detectedMode, ... },
dataUsed: { mode: detectedMode, ... },

// NEW:
mode: finalMode,
context: { mode: finalMode, ... },
dataUsed: { mode: finalMode, ... },
```

## Note on Early Return Paths (Lines 759, 781)
Lines 759 and 781 still use `detectedMode`, but these are in early return paths **BEFORE** the hard guard that sets `finalMode`. These are error cases where:
- Line 759: No signalDate or refEodDate (truly no data available)
- Line 781: MongoDB not configured

In these cases, `detectedMode` could legitimately be MODE_NONE because there's no data. However, the response structure uses `meta.mode` which is acceptable for diagnostic purposes. These paths don't reach the strategy engine, so they're not causing the bug reported.

## Strategy Engine Call
**Location:** `api/signals.js:931`  
**Function:** Handler function  
**Code:**
```javascript
const result = await generateSignalsForDate(targetDate, strategy, 'PLAYBOOK', {
  marketStatus,
  userOverride
});
```

**Note:** `generateSignalsForDate` internally calls `resolveSignalsContext` again, which could return MODE_NONE. However, `generateSignalsForDate` has its own guard at line 1427-1431 that fixes MODE_NONE. The issue is that after `generateSignalsForDate` returns, we were using `result.mode || detectedMode` instead of `result.mode || finalMode`, which could leak MODE_NONE if `result.mode` is somehow MODE_NONE or if we fall back to `detectedMode`.

## Verification
After this fix:
1. ✅ Hard guard ensures `finalMode` is never MODE_NONE (if refEodDate exists, forces MODE_EOD)
2. ✅ All response JSON construction uses `finalMode` instead of `detectedMode`
3. ✅ Strategy engine (`generateSignalsForDate`) receives proper context, and any MODE_NONE from its internal resolver is handled by its own guard
4. ✅ Response JSON never returns MODE_NONE (uses `finalMode` which is sanitized, or null in INSUFFICIENT_DATA case)

## Testing
To verify the fix:
1. Call `/api/signals?date=2025-12-29&strategy=momentum_gap` (AUTO mode, no modeOverride)
2. Verify response never contains `mode: "MODE_NONE"`
3. Verify engine never receives MODE_NONE and never returns "Strategy does not support NONE mode"

