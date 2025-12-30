# Intraday Signal Pipeline Refactor

## Problem Statement

**Current Issue:** The system generates "tomorrow intraday signals" using TODAY EOD + TODAY premarket. This is conceptually wrong because today's premarket is stale once the market closes.

**Example of the problem:**
- Market closes on Dec 30
- System generates signals for Dec 31 using:
  - Dec 30 EOD data ✅ (correct)
  - Dec 30 premarket data ❌ (wrong - this is stale!)
- Dec 31 premarket opens at 9:00 AM
- System should use Dec 31 premarket, not Dec 30 premarket

## Solution: 2-Phase Pipeline

### Phase 1: Build Candidates (After Market Close)
- **When:** After today's market closes
- **Input:** TODAY EOD data only
- **Output:** `candidates_for_next_day` collection
- **Key Rule:** TODAY premarket is NEVER used

### Phase 2: Activate Candidates (Tomorrow Premarket)
- **When:** After tomorrow's premarket data is available
- **Input:** Candidates from Phase 1 + TOMORROW premarket data
- **Output:** `active_signals_today` collection
- **Key Rule:** Only candidates that pass strict validation become active

## Architecture

### New Files Created

1. **`api/lib/signals/pipeline-config.js`**
   - Configuration for gap bounds, volume thresholds, index alignment
   - Rejection reason codes
   - Top N per strategy limit (default: 8)

2. **`api/lib/signals/candidate-builder.js`**
   - Phase 1: Builds candidates from EOD data only
   - Validates no premarket dependency
   - Stores candidates with `tradingDay` field

3. **`api/lib/signals/candidate-activator.js`**
   - Phase 2: Activates candidates with premarket validation
   - Checks: gap bounds, volume, index alignment, price levels
   - Returns active signals + rejected candidates with reasons

4. **`api/lib/signals/pipeline-orchestrator.js`**
   - Coordinates both phases
   - Database operations
   - Helper functions to fetch candidates/signals/rejected

5. **`api/pipeline.js`**
   - API endpoints for pipeline operations
   - POST `/api/pipeline/build-candidates` - Phase 1
   - POST `/api/pipeline/activate` - Phase 2
   - GET endpoints for fetching data

### Database Collections

1. **`signal_candidates`** - Stores Phase 1 candidates
   - Fields: `symbol`, `strategy`, `bias`, `keyLevels`, `confidenceBase`, `tradingDay`, `eodDate`, `status` (PENDING/ACTIVATED/REJECTED)

2. **`active_signals`** - Stores Phase 2 active signals
   - Fields: `symbol`, `strategy`, `direction`, `entry_price`, `stop_loss`, `target_price`, `score`, `gap_percent`, `premarketDate`, `eodDate`, `status` (ACTIVE)

### Validation Rules (Phase 2)

Candidates become active only if ALL of these pass:

1. **Gap Bounds:** Gap% within strategy-specific range
   - momentum_gap: 1.5% - 12%
   - breakout: 0.5% - 5.0%
   - mean_reversion: -5.0% - 0% (negative only)

2. **Volume:** Premarket volume >= threshold
   - Absolute: >= 50,000
   - Relative: >= 5% of avg 20D volume
   - If volume data missing, skip check (don't reject)

3. **Index Alignment:** NIFTY/BANKNIFTY direction aligns with candidate bias
   - LONG candidates: Index should be positive or neutral
   - SHORT candidates: Index should be negative or neutral
   - Configurable: `INDEX_ALIGNMENT_REQUIRED`

4. **Price Level:** For breakout strategies, premarket price must be above trigger + padding
   - Default padding: 0.05% above trigger

5. **Date Match:** Premarket date must match candidate `tradingDay`
   - Prevents using wrong day's premarket data

### Rejection Reasons

- `GAP_OUT_OF_RANGE` - Gap outside strategy bounds
- `LOW_RELVOL` - Premarket volume too low
- `INDEX_CONFLICT` - Index direction conflicts with bias
- `BELOW_TRIGGER` - Price below trigger level
- `DATA_MISSING` - No premarket data for symbol
- `PREM_DATE_MISMATCH` - Premarket date doesn't match trading day

## Usage

### Phase 1: Build Candidates (After Market Close)

```javascript
// After EOD data is uploaded/imported
POST /api/pipeline/build-candidates
{
  "eodDate": "2025-12-30",
  "strategy": "momentum_gap",
  "params": {}
}

// Response
{
  "success": true,
  "candidates": [...],
  "stored": 55,
  "tradingDay": "2025-12-31",
  "message": "Generated 55 candidates for 2025-12-31 using EOD from 2025-12-30"
}
```

### Phase 2: Activate Candidates (Tomorrow Premarket)

```javascript
// After tomorrow's premarket data is uploaded/imported
POST /api/pipeline/activate
{
  "premarketDate": "2025-12-31",
  "strategy": "momentum_gap"
}

// Response
{
  "success": true,
  "activeSignals": [...], // Top 8 signals
  "rejectedCandidates": [...], // With reasons
  "stored": 8,
  "message": "Activated 8 signals from 55 candidates"
}
```

### Fetch Data

```javascript
// Get candidates for a trading day
GET /api/pipeline/candidates?tradingDay=2025-12-31&strategy=momentum_gap

// Get active signals for a date
GET /api/pipeline/active?premarketDate=2025-12-31&strategy=momentum_gap

// Get rejected candidates
GET /api/pipeline/rejected?tradingDay=2025-12-31&strategy=momentum_gap
```

## Integration Points

### Automatic Triggers (To Be Implemented)

1. **After EOD Upload:**
   ```javascript
   // In upload handler, after bhavcopy is stored
   await buildCandidatesPhase(eodDate, strategy);
   ```

2. **After Premarket Upload:**
   ```javascript
   // In upload handler, after premarket is stored
   await activateCandidatesPhase(premarketDate, strategy);
   ```

### UI Changes (To Be Implemented)

1. **Signals Page Sections:**
   - Section 1: "Candidates for Tomorrow" (from `signal_candidates` collection)
     - Badge: "Needs Premarket Confirmation"
     - Show only if premarket not yet loaded
   
   - Section 2: "Active Signals (Confirmed in Premarket)" (from `active_signals` collection)
     - Show only after premarket is loaded
     - Top N per strategy (default 8)
   
   - Section 3: "Rejected in Premarket" (collapsible)
     - Show rejected candidates with reason badges
     - Expandable to see details

## Sanity Checks

### Validation Functions

1. **`validateCandidatesNoPremarket(candidates)`**
   - Ensures candidates don't have premarket-derived fields
   - Returns false if any candidate has `gap_percent`, `preM_volume`, etc.

2. **`validatePremarketDateMatch(candidates, premarketDate)`**
   - Ensures premarket date matches candidate `tradingDay`
   - Prevents using wrong day's premarket

## Migration Notes

- **No Breaking Changes:** Existing `signals_store` collection remains unchanged
- **New Collections:** `signal_candidates` and `active_signals` are additive
- **Backward Compatible:** Old signal generation still works
- **Gradual Migration:** Can run both systems in parallel during transition

## Testing Checklist

- [ ] Phase 1 generates candidates without premarket dependency
- [ ] Phase 2 rejects candidates when premarket date doesn't match
- [ ] Phase 2 activates only candidates that pass all validation rules
- [ ] Rejected candidates have proper reason codes
- [ ] Top N limit is enforced (default 8)
- [ ] Index alignment check works correctly
- [ ] Volume checks handle missing data gracefully
- [ ] UI shows candidates and active signals separately

## Next Steps

1. **Wire into Upload Handlers:**
   - Trigger Phase 1 after bhavcopy upload
   - Trigger Phase 2 after premarket upload

2. **Update UI:**
   - Add sections for candidates and active signals
   - Show rejection reasons
   - Handle missing premarket gracefully

3. **Add Monitoring:**
   - Log pipeline phase execution
   - Track activation rates
   - Monitor rejection reasons

4. **Performance:**
   - Index database collections
   - Optimize candidate queries
   - Cache index alignment data

## Files Modified

- `api/lib/mongodb.js` - Added collection getters
- `api/lib/signals/pipeline-config.js` - NEW
- `api/lib/signals/candidate-builder.js` - NEW
- `api/lib/signals/candidate-activator.js` - NEW
- `api/lib/signals/pipeline-orchestrator.js` - NEW
- `api/pipeline.js` - NEW

## Key Principles

1. **TODAY premarket NEVER influences tomorrow signals**
2. **Candidates are built from EOD only**
3. **Activation requires TOMORROW premarket**
4. **Strict validation gates prevent false activations**
5. **Rejection reasons provide transparency**
6. **Top N limit reduces noise**

