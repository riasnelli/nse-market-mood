# MODE_NONE Leak Audit - Final Report

## PASS/FAIL Table

| # | Check | Status | Location & Fix |
|---|-------|--------|----------------|
| 1 | MODE_NONE blocked before engine call | ⚠️ **PARTIAL FAIL** | ✅ Line 916: Hard assert exists<br>❌ Line 1250: POST handler has no assert - needs guard |
| 2 | API response never returns MODE_NONE | ❌ **FAIL** | ❌ Lines 1187, 1194, 1205, 1281, 1288, 1299, 1327, 1334, 1345: Error handlers return 'MODE_NONE' string |
| 3 | MongoDB never stores MODE_NONE | ❌ **FAIL** | ❌ Line 1696: Error handler stores MODE_NONE<br>⚠️ Line 1509: Guard block stores finalMode (which is MODE_NONE) |
| 4 | MongoDB query never falls back to "any mode" | ✅ **PASS** | All queries use `mode: finalMode` (lines 832, 1474, 1632) |
| 5 | No remaining "result.mode \|\| finalMode" | ✅ **PASS** | 0 occurrences - all replaced with guarded patterns |
| 6 | No remaining "mode: detectedMode" | ❌ **FAIL** | 8 occurrences found in error paths (see details below) |

---

## Detailed Findings

### ✅ PASS: Hard Assert Before Engine Call (Main Path)

**File:** `api/signals.js:915-918`
```javascript
// Hard assert: finalMode must never be MODE_NONE at this point
if (finalMode === MODE_NONE) {
  throw new Error(`[SIGNALS API] finalMode is MODE_NONE after guard — this should be impossible. refEodDate: ${refEodDate}, detectedMode: ${detectedMode}`);
}
```
**Status:** ✅ Hard assert exists immediately before generateSignalsForDate call at line 921.

---

### ❌ FAIL: POST Handler Missing Guard

**File:** `api/signals.js:1249-1250`
```javascript
// Generate signals using the new module
const result = await generateSignalsForDate(date, strategy);
```
**Problem:** POST handler bypasses all guard logic and calls generateSignalsForDate without resolvedMode option.

**Fix Required:**
```diff
+ // Apply same guard logic as GET handler
+ const context = await resolveSignalsContext({...});
+ let finalMode = context.mode;
+ if (finalMode === MODE_NONE && context.refEodDate) {
+   finalMode = MODE_EOD;
+ }
+ if (finalMode === MODE_NONE) {
+   return res.status(200).json({...INSUFFICIENT_DATA...});
+ }
+ if (finalMode === MODE_NONE) {
+   throw new Error(...);
+ }
  const result = await generateSignalsForDate(date, strategy, 'PLAYBOOK', {
+   resolvedMode: finalMode
  });
```

---

### ❌ FAIL: Error Handlers Return MODE_NONE String

**Files:** `api/signals.js:1187, 1194, 1205, 1281, 1288, 1299, 1327, 1334, 1345`

**Example (Line 1187):**
```javascript
mode: 'MODE_NONE',  // ❌ Returns MODE_NONE string
```

**Fix Required:**
```diff
- mode: 'MODE_NONE',
+ mode: null,  // Error case - no mode available
```

---

### ❌ FAIL: MongoDB Error Handler Stores MODE_NONE

**File:** `api/lib/signals/generateSignals.js:1689-1696`
```javascript
await signalsStoreCollection.updateOne(
  { date: signalDate, strategy },
  {
    $set: {
      mode: MODE_NONE,  // ❌ Stores MODE_NONE
      status: 'ERROR',
```

**Fix Required:**
```diff
      $set: {
-       mode: MODE_NONE,
+       mode: null,  // Error case - don't store MODE_NONE
        status: 'ERROR',
```

---

### ❌ FAIL: generateSignalsForDate Error Paths Use detectedMode

**File:** `api/lib/signals/generateSignals.js:1403, 1411, 1431`

**Line 1403:**
```javascript
mode: detectedMode,  // ❌ Could be MODE_NONE if options.resolvedMode not provided
```

**Fix Required:**
```diff
- mode: detectedMode,
+ mode: options.resolvedMode || detectedMode,  // Prefer resolvedMode if provided
+ // Or better: ensure options.resolvedMode is always provided when called
```

**Note:** This function is called with `resolvedMode: finalMode` from the main path, but error paths before this point could still use detectedMode.

---

### ❌ FAIL: MODE_NONE Guard Block Stores/Returns MODE_NONE

**File:** `api/lib/signals/generateSignals.js:1503-1539`

**Line 1509, 1518, 1528, 1539:**
```javascript
if (finalMode === MODE_NONE) {
  const noDataDoc = {
    mode: finalMode,  // ❌ finalMode is MODE_NONE here
    ...
    dataUsed: {
      mode: detectedMode,  // ❌ Could be MODE_NONE
    }
  };
  await signalsStoreCollection.updateOne(
    { date: signalDate, strategy, mode: detectedMode },  // ❌ Could query/store MODE_NONE
  return {
    mode: detectedMode,  // ❌ Returns MODE_NONE
```

**Status:** This is intentional for INSUFFICIENT_DATA cases, but still stores/returns MODE_NONE.

**Fix Required:**
```diff
  if (finalMode === MODE_NONE) {
    const noDataDoc = {
-     mode: finalMode,
+     mode: null,  // Don't store MODE_NONE
      ...
      dataUsed: {
-       mode: detectedMode,
+       mode: null,
      }
    };
    await signalsStoreCollection.updateOne(
-     { date: signalDate, strategy, mode: detectedMode },
+     { date: signalDate, strategy, mode: null },  // Query by null or use a different key
    return {
-     mode: detectedMode,
+     mode: null,  // Return null instead of MODE_NONE
```

---

### ❌ FAIL: Early Returns Use detectedMode

**File:** `api/signals.js:759, 781`

**Line 759:**
```javascript
meta: {
  mode: detectedMode  // ❌ Could be MODE_NONE
}
```

**Status:** These are early returns before the guard logic, so detectedMode could be MODE_NONE.

**Fix Required:** Apply guard logic earlier, or return null for mode in these error cases.

---

## Summary

**Current Status:** ❌ **NOT PROVEN SAFE**

**Critical Issues:**
1. POST handler bypasses guards (line 1250)
2. Error handlers return 'MODE_NONE' string (13 occurrences)
3. Error handler stores MODE_NONE in MongoDB (line 1696)
4. MODE_NONE guard block stores/returns MODE_NONE (lines 1509, 1518, 1528, 1539)
5. generateSignalsForDate error paths use detectedMode (lines 1403, 1411, 1431)
6. Early returns use detectedMode (lines 759, 781)

**Recommendation:** Fix all FAIL cases before claiming MODE_NONE cannot leak.

