# MODE_NONE Leak Fix - Complete Summary

## Changes Implemented

### 1. Helper Functions Added ✅
**Location:** `api/signals.js:34-51`

- `sanitizeMode(mode, fallback = MODE_EOD)`: Returns fallback when mode is MODE_NONE/'MODE_NONE'/null/undefined/''
- `assertNoModeNone(mode, where)`: Throws if mode is MODE_NONE or 'MODE_NONE'

### 2. POST Handler Fixed ✅
**Location:** `api/signals.js:1268-1343`

- ✅ Computes marketStatus same as GET handler
- ✅ Calls `resolveSignalsContext({ targetDate: date, today, marketStatus, userOverride })`
- ✅ Applies same guard logic to compute finalMode
- ✅ Returns INSUFFICIENT_DATA with `mode: null` when finalMode is MODE_NONE (does NOT write to DB)
- ✅ Calls `generateSignalsForDate(date, strategy, 'PLAYBOOK', { marketStatus, userOverride, resolvedMode: finalMode })`
- ✅ Hard assert before generateSignalsForDate call

### 3. All 'MODE_NONE' Strings Removed from Responses ✅
**Locations Fixed:**
- Line 778: Early return meta.mode changed from detectedMode to null
- Line 797: MongoDB not configured meta.mode changed from detectedMode to null
- Lines 1187, 1194, 1205: Error handler responses changed from 'MODE_NONE' to null
- Lines 1281, 1288, 1299: Method not allowed responses changed from 'MODE_NONE' to null
- Lines 1327, 1334, 1345: Catch block error responses changed from 'MODE_NONE' to null

### 4. MongoDB Storage Protection ✅
**Location:** `api/signals.js:857-860`

- ✅ Added `assertNoModeNone(storedDoc.mode, 'storedDoc.mode from signals_store')` before using storedDoc
- ✅ Query already uses `mode: finalMode` (line 851)
- ✅ All stored docs use finalMode (sanitized), never detectedMode
- ✅ INSUFFICIENT_DATA cases return early and do NOT write to DB

### 5. "mode: detectedMode" Eliminated ✅
**Result:** 0 occurrences found in api/signals.js

All instances replaced with:
- `mode: finalMode` (sanitized)
- `mode: null` (error cases)
- Guarded patterns: `(result.mode && result.mode !== MODE_NONE && result.mode !== 'MODE_NONE') ? result.mode : finalMode`

---

## Verification Report

### Search Results After Fix:

```
1. Count of 'MODE_NONE' in responses: 0 ✅
   (Only found in comments, imports, and guard checks - not in JSON)

2. Count of "mode: detectedMode": 0 ✅

3. POST handler uses resolveSignalsContext: ✅
   Location: Line 1286

4. POST handler uses resolvedMode: ✅
   Location: Line 1342 (resolvedMode: finalMode)
```

---

## Key Improvements

1. **POST handler no longer bypasses guard logic** - uses same resolver/guard as GET
2. **All error responses use `mode: null`** instead of 'MODE_NONE' string
3. **MongoDB storage protected** with assertNoModeNone check
4. **All response fields sanitized** - mode, resolvedMode, context.mode, dataUsed.mode all use finalMode or null
5. **Hard asserts prevent regressions** - assertNoModeNone throws if MODE_NONE somehow leaks through

---

## Files Modified

- `api/signals.js`: 178 lines changed (+132 insertions, -46 deletions)

**Status:** ✅ **COMPLETE** - All requirements implemented and verified.

