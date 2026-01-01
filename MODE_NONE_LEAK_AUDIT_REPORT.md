# MODE_NONE Leak Audit Report

## PASS/FAIL Table

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | MODE_NONE blocked before engine call | ⚠️ **PARTIAL FAIL** | Hard assert exists at line 916, but line 1250 call has no assert |
| 2 | API response never returns MODE_NONE | ❌ **FAIL** | Multiple error handlers return 'MODE_NONE' string (lines 1187, 1194, 1205, etc.) |
| 3 | MongoDB never stores MODE_NONE | ❌ **FAIL** | Line 1696 stores MODE_NONE, line 1509 stores finalMode (which could be MODE_NONE in guard block) |
| 4 | MongoDB query never falls back to "any mode" | ✅ **PASS** | All queries use mode: finalMode |
| 5 | No remaining "result.mode \|\| finalMode" | ✅ **PASS** | 0 occurrences found |
| 6 | No remaining "mode: detectedMode" | ❌ **FAIL** | 8 occurrences found in error paths |

---

## Detailed Findings

### 1. MODE_NONE Blocked Before Engine Call

#### ✅ PASS: Main GET Handler (Line 916)
**File:** `api/signals.js:915-918`
```javascript
// Hard assert: finalMode must never be MODE_NONE at this point
if (finalMode === MODE_NONE) {
  throw new Error(`[SIGNALS API] finalMode is MODE_NONE after guard — this should be impossible...`);
}
```
**Status:** ✅ Hard assert exists immediately before generateSignalsForDate call at line 921.

#### ❌ FAIL: POST Handler (Line 1250)
**File:** `api/signals.js:1249-1250`
```javascript
// Generate signals using the new module
const result = await generateSignalsForDate(date, strategy);
```
**Status:** ❌ No hard assert before this call. This is a different code path (POST handler) that bypasses the guard logic.

**Fix Required:**
- This POST handler path doesn't have the same guard logic
- Need to ensure it uses the same guard before calling generateSignalsForDate

---

### 2. API Response Never Returns MODE_NONE

#### ✅ PASS: Main Success Responses
- Line 957: `mode: resolvedMode` (guarded)
- Line 1033: `mode: resolvedMode` (guarded)
- Line 1090: `mode: (result.mode && result.mode !== MODE_NONE...) ? result.mode : finalMode` (guarded)

#### ❌ FAIL: Error Handler Responses
**File:** `api/signals.js:1187, 1194, 1205, 1281, 1288, 1299, 1327, 1334, 1345`
```javascript
// Line 1187
mode: 'MODE_NONE',
// Line 1194
context: {
  mode: 'MODE_NONE',
// Line 1205
dataUsed: {
  mode: 'MODE_NONE',
```
**Status:** ❌ These are error handlers that return 'MODE_NONE' as string. While these are error paths, they still leak MODE_NONE into responses.

**Fix Required:** These should return `null` or omit the mode field in error cases.

---

### 3. MongoDB Never Stores MODE_NONE

#### ✅ PASS: Main Storage Paths
- Line 1609: `mode: finalMode` (sanitized)
- Line 1632: Query uses `mode: finalMode`
- Line 1474: Query uses `mode: finalMode`

#### ❌ FAIL: Error Handler Storage
**File:** `api/lib/signals/generateSignals.js:1696`
```javascript
await signalsStoreCollection.updateOne(
  { date: signalDate, strategy },
  {
    $set: {
      mode: MODE_NONE,  // ❌ Stores MODE_NONE
      status: 'ERROR',
```
**Status:** ❌ Stores MODE_NONE in error handler. This pollutes the database.

#### ⚠️ PARTIAL: MODE_NONE Guard Block Storage
**File:** `api/lib/signals/generateSignals.js:1509, 1528`
```javascript
if (finalMode === MODE_NONE) {
  const noDataDoc = {
    mode: finalMode,  // finalMode is MODE_NONE here
    ...
  };
  await signalsStoreCollection.updateOne(
    { date: signalDate, strategy, mode: detectedMode },  // Uses detectedMode
```
**Status:** ⚠️ In the guard block where finalMode === MODE_NONE, it stores finalMode (which is MODE_NONE) and queries with detectedMode (which might also be MODE_NONE). This is intentional for INSUFFICIENT_DATA cases, but still stores MODE_NONE.

---

### 4. MongoDB Query Never Falls Back to "any mode"

#### ✅ PASS: All Queries Use finalMode
- Line 832: `mode: finalMode`
- Line 1474: `mode: finalMode`
- Line 1632: `mode: finalMode`

**Exception:** Line 1528 uses `mode: detectedMode` but this is inside a guard block where finalMode === MODE_NONE, so it's intentional.

---

### 5. No Remaining "result.mode || finalMode"

#### ✅ PASS
**Result:** 0 occurrences found. All instances have been replaced with guarded patterns.

---

### 6. No Remaining "mode: detectedMode"

#### ❌ FAIL: Found 8 Occurrences

**File:** `api/signals.js:759, 781`
```javascript
// Line 759 - Early return before guard
meta: {
  mode: detectedMode
}
// Line 781 - MongoDB not configured error
meta: {
  mode: detectedMode
}
```
**Status:** ❌ These are early returns before the guard, so detectedMode could be MODE_NONE.

**File:** `api/lib/signals/generateSignals.js:1403, 1411, 1431`
```javascript
// Line 1403 - INSUFFICIENT_DATA return (no signalDate/refEodDate)
mode: detectedMode,
// Line 1411 - dataUsed.mode
mode: detectedMode,
// Line 1431 - Unknown strategy error
mode: detectedMode,
```
**Status:** ❌ These are in generateSignalsForDate error paths. If options.resolvedMode is not provided, detectedMode could be MODE_NONE.

**File:** `api/lib/signals/generateSignals.js:1518, 1528, 1539`
```javascript
// Line 1518 - MODE_NONE guard block
if (finalMode === MODE_NONE) {
  dataUsed: {
    mode: detectedMode,  // Could be MODE_NONE
  }
  await signalsStoreCollection.updateOne(
    { date: signalDate, strategy, mode: detectedMode },  // Could be MODE_NONE
  return {
    mode: detectedMode,  // Could be MODE_NONE
```
**Status:** ❌ Inside the guard block where finalMode === MODE_NONE, detectedMode is used, which could also be MODE_NONE. This stores MODE_NONE in database and returns it.

---

## Summary of Required Fixes

### Critical Fixes (MODE_NONE can leak)

1. **Line 1250**: Add guard/hard assert before generateSignalsForDate call in POST handler
2. **Lines 1187, 1194, 1205, 1281, 1288, 1299, 1327, 1334, 1345**: Change error handlers to return `null` instead of `'MODE_NONE'`
3. **Line 1696**: Change error handler storage to use `null` or omit mode field instead of MODE_NONE
4. **Lines 759, 781**: Use finalMode or null instead of detectedMode (but these are before guard, so need early guard)
5. **Lines 1403, 1411, 1431**: Use finalMode or guard in generateSignalsForDate error paths
6. **Lines 1518, 1528, 1539**: In MODE_NONE guard block, use null instead of storing/returning MODE_NONE

