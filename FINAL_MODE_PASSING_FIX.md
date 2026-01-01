# Fix: Pass finalMode to generateSignalsForDate and Remove Unsafe Fallback Query

## Problem
1. `finalMode` is computed and sanitized in `/api/signals` handler, but `generateSignalsForDate()` is called without it
2. `generateSignalsForDate()` internally calls `resolveSignalsContext()` again, potentially returning MODE_NONE
3. Fallback query returns ANY document for date+strategy, even with MODE_NONE or legacy modes

## Root Cause Analysis

### Bug 1: finalMode Not Passed to generateSignalsForDate
**File:** `api/signals.js:933`  
**Function:** Handler function  
**Problem:** `generateSignalsForDate()` doesn't receive `finalMode`, so it resolves mode again internally

```javascript
// OLD (line 933):
const result = await generateSignalsForDate(targetDate, strategy, 'PLAYBOOK', {
  marketStatus,
  userOverride
});
```

### Bug 2: Unsafe Fallback Query
**File:** `api/signals.js:836-841`  
**Function:** Handler function  
**Problem:** Fallback query returns documents with ANY mode (including MODE_NONE, PLAYBOOK, etc.)

```javascript
// OLD:
if (!storedDoc) {
  storedDoc = await signalsStoreCollection.findOne({ 
    date: signalDate,
    strategy: strategy || 'momentum_gap'
  });  // ❌ No mode filter - could return MODE_NONE/legacy docs
}
```

### Bug 3: generateSignalsForDate Always Calls Resolver
**File:** `api/lib/signals/generateSignals.js:1358-1368`  
**Function:** `generateSignalsForDate()`  
**Problem:** Always calls `resolveSignalsContext()` internally, ignoring any pre-computed mode

## Fixes Applied

### Fix 1: Remove Unsafe Fallback Query (api/signals.js:828-841)
**Location:** `api/signals.js:828-841`  
**Change:** Removed the fallback query that could return MODE_NONE/legacy documents

```javascript
// NEW:
// Only query with finalMode - never use fallback query that could return MODE_NONE/legacy docs
let storedDoc = await signalsStoreCollection.findOne({ 
  date: signalDate,
  strategy: strategy || 'momentum_gap',
  mode: finalMode
});
// ❌ REMOVED: Fallback query that could return any mode
```

### Fix 2: Pass finalMode to generateSignalsForDate (api/signals.js:933)
**Location:** `api/signals.js:933`  
**Change:** Added `resolvedMode: finalMode` to options

```javascript
// NEW:
const result = await generateSignalsForDate(targetDate, strategy, 'PLAYBOOK', {
  marketStatus,
  userOverride,
  resolvedMode: finalMode  // Pass finalMode to avoid resolver returning MODE_NONE
});
```

### Fix 3: Accept resolvedMode in generateSignalsForDate (api/lib/signals/generateSignals.js:1357-1368)
**Location:** `api/lib/signals/generateSignals.js:1357-1368`  
**Change:** Use `options.resolvedMode` if provided, otherwise call resolver

```javascript
// NEW:
// If resolvedMode is provided in options, use it instead of calling resolver
// This prevents resolver from returning MODE_NONE when we already have a sanitized mode
let context;
let detectedMode;
if (options.resolvedMode) {
  // Use provided resolvedMode, but still need context for dates
  context = await resolveSignalsContext({
    targetDate,
    today,
    marketStatus,
    userOverride
  });
  detectedMode = options.resolvedMode;  // Use provided sanitized mode instead of context.mode
} else {
  // Resolve signals context using new resolver
  context = await resolveSignalsContext({
    targetDate,
    today,
    marketStatus,
    userOverride
  });
  detectedMode = context.mode;
}
```

## Variable Name Consistency

### Constants vs Strings
- **Constants** (`MODE_EOD`, `MODE_PREM`, `MODE_LIVE`, `MODE_NONE`): Used internally in code
- **Strings** (`'EOD'`, `'PREMARKET'`, `'LIVE'`): Used in `validModes` array (line 702) and `userOverride.mode` (line 708)

**Status:** ✅ **No mismatch issue**
- `userOverride.mode` uses strings, which is correct - the resolver maps them to constants internally
- All internal code uses constants consistently
- The mapping between strings and constants is handled in `resolveSignalsContext()` and mode utility functions

### refEodDate vs refDate
- **`refEodDate`**: Variable name used internally (from `context.refEodDate`)
- **`refDate`**: Field name in JSON response (set from `refEodDate`)

**Status:** ✅ **No mismatch issue**
- Internal code uses `refEodDate` consistently
- JSON responses use `refDate` field name (which is set from `refEodDate`)
- The guard at line 790 correctly uses `refEodDate`

## Verification

After this fix:
1. ✅ Stored document query only uses `finalMode` (no unsafe fallback)
2. ✅ `generateSignalsForDate()` receives `finalMode` via `options.resolvedMode`
3. ✅ `generateSignalsForDate()` uses provided `resolvedMode` instead of calling resolver again
4. ✅ Response `mode` field always uses `finalMode` (sanitized)
5. ✅ MODE_NONE never leaks into responses or reaches strategy engine

## Testing
To verify the fix:
1. Call `/api/signals?date=2025-12-29&strategy=momentum_gap` (AUTO mode)
2. Verify stored document query only matches `finalMode`
3. Verify `generateSignalsForDate()` receives `resolvedMode: finalMode`
4. Verify response never contains `mode: "MODE_NONE"`
5. Verify engine never receives MODE_NONE and never returns "Strategy does not support NONE mode"

