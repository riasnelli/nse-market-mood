# Final Mode Hardening - Remaining Issues

## Issues Found

### 1. result.mode || finalMode - Lines 940, 1014, 1082, 1090, 1101, 1113
**Problem:** If `result.mode` is MODE_NONE, this leaks into response

**Current:**
```javascript
const resolvedMode = result.mode || finalMode;
```

**Fix:** Guard against MODE_NONE
```javascript
const resolvedMode = (result.mode && result.mode !== MODE_NONE && result.mode !== 'MODE_NONE') ? result.mode : finalMode;
```

### 2. userOverride.mode can be undefined
**Location:** Line 708
**Current:** `mode: overrideMode` where `overrideMode` can be `undefined`
**Status:** Need to verify resolver treats undefined as AUTO

### 3. PLAYBOOK third argument still passed
**Location:** Line 915
**Current:** `generateSignalsForDate(targetDate, strategy, 'PLAYBOOK', {...})`
**Status:** Need to verify this argument is truly ignored

### 4. Missing hard assert before generateSignalsForDate
**Location:** Before line 915
**Need:** Assert that finalMode !== MODE_NONE

