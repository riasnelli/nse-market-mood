# MODE_NONE Leak from Stored Documents - Fix Summary

## Problem
Signals API returns `mode=MODE_NONE` even though `refDate` exists (e.g., `refDate: '2025-12-26'`) and AUTO should resolve to EOD/PREMARKET/LIVE. The response shows `mode: 'MODE_NONE'` which causes the strategy engine to reject it.

## Root Cause
**File:** `api/signals.js`  
**Location:** Lines 846, 891, 912  
**Function:** Handler function, stored document response section

The stored document validation check at line 846 did **NOT** check for `MODE_NONE`. Even if a stored document contained `mode: 'MODE_NONE'`, it would pass the validation and be returned directly at line 891 without sanitization.

### Issue 1: Stored Document Validation (Line 846)
The check only filtered out:
- `'PLAYBOOK'`
- Empty/null modes
- Modes that don't start with 'MODE_' AND aren't EOD/PREMARKET/LIVE

But `MODE_NONE` starts with `'MODE_'`, so it **passed the check** and was returned as-is.

### Issue 2: Direct Mode Return (Line 891, 912)
Even if validation passed, the code directly returned `storedMode` in the response without sanitization:
```javascript
mode: storedMode,  // ❌ Could be MODE_NONE
resolvedMode: storedMode,  // ❌ Could be MODE_NONE
```

## Fix Applied

### Fix 1: Add MODE_NONE to Validation Check (Line 846)
```javascript
// OLD:
if (storedMode === 'PLAYBOOK' || !storedMode || (!storedMode.startsWith('MODE_') && storedMode !== 'EOD' && storedMode !== 'PREMARKET' && storedMode !== 'LIVE')) {

// NEW:
if (storedMode === 'PLAYBOOK' || storedMode === MODE_NONE || !storedMode || (!storedMode.startsWith('MODE_') && storedMode !== 'EOD' && storedMode !== 'PREMARKET' && storedMode !== 'LIVE')) {
```

This causes stored documents with MODE_NONE to be skipped and regenerated.

### Fix 2: Sanitize Stored Mode Before Using (Lines 872-873, 891, 912)
```javascript
// OLD:
const storedMode = storedDoc.mode;
const modeDisplay = storedMode ? getModeDisplayName(storedMode) : 'EOD';
// ...
mode: storedMode,
// ...
resolvedMode: storedMode,

// NEW:
const storedMode = storedDoc.mode;
const sanitizedMode = (storedMode === MODE_NONE || !storedMode) ? finalMode : storedMode;
const modeDisplay = sanitizedMode ? getModeDisplayName(sanitizedMode) : 'EOD';
// ...
mode: sanitizedMode,
// ...
resolvedMode: sanitizedMode,
```

This ensures that even if a stored document somehow has MODE_NONE, we use `finalMode` (which has been sanitized by the hard guard at line 790) instead.

## Variable Names
- **refEodDate** (line 735): Variable name used throughout (from `context.refEodDate`)
- **refDate** (lines 889, 908, etc.): Field name in JSON response (set from `refEodDate`)
- **No mismatch issue**: The guard at line 790 correctly uses `refEodDate`, and responses correctly use `refDate: storedDoc.refDate || refEodDate`

## Market Status Parsing
**Location:** Line 688  
**Status:** ✅ Already correct

The code correctly parses `marketStatus` from the query string:
```javascript
const clientMarketStatus = JSON.parse(req.query.marketStatus);
```

## Strategy Engine Call
**Location:** Line 931  
**Status:** ✅ Already correct

The engine is called via `generateSignalsForDate()`, which has its own internal guard at line 1428-1431. The issue was in the stored document response path, not the engine call.

## Verification
After this fix:
1. ✅ Stored documents with MODE_NONE are rejected and regenerated
2. ✅ Even if a stored document has MODE_NONE, response uses sanitized `finalMode`
3. ✅ Response JSON never returns MODE_NONE (uses `sanitizedMode` which defaults to `finalMode`)
4. ✅ The hard guard (line 790) ensures `finalMode` is never MODE_NONE when refEodDate exists

## Testing
To verify the fix:
1. Call `/api/signals?date=2025-12-29&strategy=momentum_gap` (AUTO mode, no modeOverride)
2. Verify response never contains `mode: "MODE_NONE"`
3. Verify stored documents with MODE_NONE are regenerated
4. Verify engine never receives MODE_NONE and never returns "Strategy does not support NONE mode"

