# MODE_NONE Leak Analysis - Critical Issues Found

## Verdict

**Can MODE_NONE reach the strategy engine?** ❌ **YES** (Line 1567)  
**Can MODE_NONE reach the API response?** ❌ **YES** (Lines 1645, 1658)

## Critical Leaks

### 1. Strategy Engine Call - Line 1567 ❌ CRITICAL
**File:** `api/lib/signals/generateSignals.js:1567`  
**Problem:** Strategy engine receives `detectedMode` instead of `finalMode`

```javascript
// Line 1565-1567:
const result = await strategyDef.run({
  date: signalDate,
  mode: detectedMode,  // ❌ LEAK: Should be finalMode
  eodDate: refEodDate,
  ...
});
```

**Why it leaks:**
- Even though `options.resolvedMode` is set to `finalMode` (line 1369), the function computes its own `finalMode` at line 1442
- But then it **ignores** `finalMode` and uses `detectedMode` for the strategy call
- If `detectedMode` somehow becomes MODE_NONE (shouldn't happen, but defensive), it reaches the engine

**Fix:** Change `mode: detectedMode` to `mode: finalMode`

---

### 2. API Response - Line 1645 ❌ CRITICAL
**File:** `api/lib/signals/generateSignals.js:1645`  
**Problem:** Return value uses `detectedMode` instead of `finalMode`

```javascript
// Line 1639-1645:
return {
  status,
  targetDate,
  signalDate,
  refDate: refEodDate,
  strategy,
  mode: detectedMode,  // ❌ LEAK: Should be finalMode
  ...
};
```

**Why it leaks:**
- This is the return value that goes back to `api/signals.js` and becomes the API response
- Uses `detectedMode` instead of `finalMode`

**Fix:** Change `mode: detectedMode` to `mode: finalMode`

---

### 3. API Response dataUsed.mode - Line 1658 ❌ CRITICAL
**File:** `api/lib/signals/generateSignals.js:1658`  
**Problem:** `dataUsed.mode` in return value uses `detectedMode` instead of `finalMode`

```javascript
// Line 1655-1658:
dataUsed: {
  refEodDate,
  premarketDate,
  mode: detectedMode,  // ❌ LEAK: Should be finalMode
  ...
}
```

**Fix:** Change `mode: detectedMode` to `mode: finalMode`

---

### 4. MongoDB Storage - Line 1609 ❌ STORAGE LEAK
**File:** `api/lib/signals/generateSignals.js:1609`  
**Problem:** Stored document uses `detectedMode` instead of `finalMode`

```javascript
// Line 1605-1609:
const storeDoc = {
  date: signalDate,
  refDate: refEodDate,
  strategy,
  mode: detectedMode,  // ❌ LEAK: Should be finalMode
  ...
};
```

**Why it leaks:**
- Documents stored with `detectedMode` could have MODE_NONE
- Even though query uses `{ mode: finalMode }`, if a doc was previously stored with MODE_NONE, it won't match
- But if a new doc is stored with `detectedMode === MODE_NONE`, it pollutes the database

**Fix:** Change `mode: detectedMode` to `mode: finalMode`

---

### 5. MongoDB Storage dataUsed.mode - Line 1621 ❌ STORAGE LEAK
**File:** `api/lib/signals/generateSignals.js:1621`  
**Problem:** `dataUsed.mode` in stored document uses `detectedMode` instead of `finalMode`

```javascript
// Line 1618-1621:
dataUsed: {
  refEodDate,
  premarketDate,
  mode: detectedMode,  // ❌ LEAK: Should be finalMode
  ...
}
```

**Fix:** Change `mode: detectedMode` to `mode: finalMode`

---

### 6. MongoDB Upsert Query - Line 1632 ❌ QUERY MISMATCH
**File:** `api/lib/signals/generateSignals.js:1632`  
**Problem:** Upsert query uses `detectedMode` instead of `finalMode`

```javascript
// Line 1631-1632:
await signalsStoreCollection.updateOne(
  { date: signalDate, strategy, mode: detectedMode },  // ❌ Should be finalMode
  ...
);
```

**Why it's wrong:**
- Query uses `detectedMode`, but stored doc has `mode: detectedMode` (line 1609)
- If `detectedMode !== finalMode`, the query won't match existing docs with `finalMode`
- Could create duplicate documents with different modes

**Fix:** Change `mode: detectedMode` to `mode: finalMode`

---

## Edge Cases (These are OK)

### Lines 1518, 1528, 1539 - MODE_NONE Guard Block
**Status:** ✅ **OK** - These are in a block where `finalMode === MODE_NONE` (line 1503), so using `detectedMode` is correct for error handling

### Lines 1403, 1411, 1431 - Early Return Paths
**Status:** ✅ **OK** - These are error paths before the guard, but they check `!signalDate || !refEodDate`, so they're legitimate error cases

---

## Positional Argument Question

**Should `finalMode` be passed as positional argument?** ❌ **NO**

**Reason:**
- The function signature is: `generateSignalsForDate(targetDate, strategy, legacyMode, options)`
- The `legacyMode` parameter (3rd position) is documented as "ignored, mode is auto-detected"
- Passing `finalMode` there would be confusing and redundant
- Using `options.resolvedMode` is the correct approach

**However:** The function should use `finalMode` internally, not `detectedMode`, after computing it.

---

## MongoDB Query Safety

**Can stored docs cause mismatch even with `{ mode: finalMode }` query?** ✅ **YES, but only if:**

1. A document was previously stored with `mode: MODE_NONE` or `mode: detectedMode` (when `detectedMode !== finalMode`)
2. The query `{ date, strategy, mode: finalMode }` won't find it
3. But if the function stores a new doc with `mode: detectedMode` (line 1609), it creates a mismatch

**Current protection:**
- Line 836-842: Checks stored doc mode and rejects MODE_NONE/legacy
- But this only works if the query finds the doc first

**Risk:**
- If a doc with `mode: MODE_NONE` exists but query uses `mode: finalMode`, it won't be found
- Function will generate new signals and store with `mode: detectedMode` (line 1609)
- If `detectedMode !== finalMode`, you get duplicate docs

---

## Required Fixes

Replace all instances of `detectedMode` with `finalMode` in:
1. Line 1567: Strategy engine call
2. Line 1609: Stored document `mode` field
3. Line 1621: Stored document `dataUsed.mode` field
4. Line 1632: MongoDB upsert query
5. Line 1645: Return value `mode` field
6. Line 1658: Return value `dataUsed.mode` field

**Exception:** Keep `detectedMode` in:
- Line 1557: `if (detectedMode === MODE_LIVE)` - this is a mode check, not storage
- Lines 1518, 1528, 1539: MODE_NONE guard block (error handling)

