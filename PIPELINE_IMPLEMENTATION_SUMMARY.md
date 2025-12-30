# Intraday Signal Pipeline Implementation Summary

## ✅ Completed Implementation

### Core Pipeline Files Created

1. **`api/lib/signals/pipeline-config.js`** ✅
   - Configuration for gap bounds per strategy
   - Volume thresholds (absolute and relative)
   - Index alignment requirements
   - Rejection reason codes
   - Top N per strategy limit (default: 8)

2. **`api/lib/signals/candidate-builder.js`** ✅
   - Phase 1: Builds candidates from EOD data only
   - Validates no premarket dependency
   - Stores candidates with `tradingDay` field
   - Includes sanity check: `validateCandidatesNoPremarket()`

3. **`api/lib/signals/candidate-activator.js`** ✅
   - Phase 2: Activates candidates with premarket validation
   - Validates: gap bounds, volume, index alignment, price levels
   - Returns active signals + rejected candidates with reasons
   - Includes sanity check: `validatePremarketDateMatch()`

4. **`api/lib/signals/pipeline-orchestrator.js`** ✅
   - Coordinates both phases
   - Database operations (store candidates, active signals, rejected)
   - Helper functions to fetch data

5. **`api/pipeline.js`** ✅
   - API endpoints for pipeline operations
   - Vercel-compatible handler
   - Routes: POST build-candidates, POST activate, GET candidates/active/rejected

### Database Updates

- **`api/lib/mongodb.js`** ✅
  - Added `getSignalCandidatesCollection()`
  - Added `getActiveSignalsCollection()`
  - Exported new collection getters

### Collections Created

1. **`signal_candidates`** - Stores Phase 1 candidates
   - Status: PENDING → ACTIVATED/REJECTED
   - Fields: symbol, strategy, bias, keyLevels, confidenceBase, tradingDay, eodDate

2. **`active_signals`** - Stores Phase 2 active signals
   - Status: ACTIVE
   - Fields: symbol, strategy, direction, entry_price, stop_loss, target_price, score, gap_percent, premarketDate

### API Endpoints Available

- `POST /api/pipeline/build-candidates` - Phase 1
- `POST /api/pipeline/activate` - Phase 2
- `GET /api/pipeline/candidates?tradingDay=YYYY-MM-DD&strategy=momentum_gap`
- `GET /api/pipeline/active?premarketDate=YYYY-MM-DD&strategy=momentum_gap`
- `GET /api/pipeline/rejected?tradingDay=YYYY-MM-DD&strategy=momentum_gap`

## 🔄 Remaining Tasks

### 1. Automatic Triggers (Not Yet Implemented)

**Location:** Upload handlers in `api/data.js` or `api/admin.js`

**Phase 1 Trigger (After EOD Upload):**
```javascript
// After bhavcopy is successfully uploaded
const { buildCandidatesPhase } = require('./lib/signals/pipeline-orchestrator');
await buildCandidatesPhase(eodDate, 'momentum_gap', {});
```

**Phase 2 Trigger (After Premarket Upload):**
```javascript
// After premarket is successfully uploaded
const { activateCandidatesPhase } = require('./lib/signals/pipeline-orchestrator');
await activateCandidatesPhase(premarketDate, 'momentum_gap');
```

### 2. UI Integration (Not Yet Implemented)

**Location:** `public/app.js` - `loadSignals()` and `renderSignals()`

**Required Changes:**

1. **Fetch Candidates and Active Signals Separately:**
   ```javascript
   // Fetch candidates for tomorrow
   const candidatesResponse = await fetch(`/api/pipeline/candidates?tradingDay=${tomorrowDate}&strategy=${strategy}`);
   const candidatesData = await candidatesResponse.json();
   
   // Fetch active signals for today
   const activeResponse = await fetch(`/api/pipeline/active?premarketDate=${todayDate}&strategy=${strategy}`);
   const activeData = await activeResponse.json();
   
   // Fetch rejected candidates
   const rejectedResponse = await fetch(`/api/pipeline/rejected?tradingDay=${todayDate}&strategy=${strategy}`);
   const rejectedData = await rejectedResponse.json();
   ```

2. **Render Three Sections:**
   - Section 1: "Candidates for Tomorrow" (if premarket not loaded)
   - Section 2: "Active Signals (Confirmed in Premarket)" (if premarket loaded)
   - Section 3: "Rejected in Premarket" (collapsible, with reason badges)

3. **Update Signals Status Panel:**
   - Show candidate count vs active signal count
   - Show activation rate
   - Show top rejection reasons

### 3. Testing (Not Yet Implemented)

**Unit Tests Needed:**
- [ ] `validateCandidatesNoPremarket()` - ensures no premarket data in candidates
- [ ] `validatePremarketDateMatch()` - ensures date matching
- [ ] Gap bounds validation
- [ ] Volume threshold validation
- [ ] Index alignment logic
- [ ] Top N limit enforcement

**Integration Tests Needed:**
- [ ] Phase 1 generates candidates correctly
- [ ] Phase 2 activates only valid candidates
- [ ] Rejected candidates have proper reasons
- [ ] Database operations work correctly

## Key Features Implemented

### ✅ Phase 1: Candidate Building
- Uses ONLY EOD data (no premarket)
- Validates no premarket dependency
- Stores candidates with trading day
- Sorted by confidence score

### ✅ Phase 2: Candidate Activation
- Validates gap bounds per strategy
- Checks premarket volume (absolute and relative)
- Validates index alignment (NIFTY/BANKNIFTY)
- Checks price above trigger (for breakouts)
- Enforces date matching
- Limits to top N per strategy (default 8)
- Tracks rejection reasons

### ✅ Data Integrity
- Timestamps stored for audit trail
- Date validation prevents wrong premarket usage
- Status tracking (PENDING → ACTIVATED/REJECTED)
- Rejection reasons stored with details

## Usage Examples

### Manual Phase 1 Trigger
```bash
curl -X POST https://your-domain.vercel.app/api/pipeline/build-candidates \
  -H "Content-Type: application/json" \
  -H "x-app-key: YOUR_APP_KEY" \
  -d '{
    "eodDate": "2025-12-30",
    "strategy": "momentum_gap",
    "params": {}
  }'
```

### Manual Phase 2 Trigger
```bash
curl -X POST https://your-domain.vercel.app/api/pipeline/activate \
  -H "Content-Type: application/json" \
  -H "x-app-key: YOUR_APP_KEY" \
  -d '{
    "premarketDate": "2025-12-31",
    "strategy": "momentum_gap"
  }'
```

### Fetch Data
```bash
# Get candidates
curl "https://your-domain.vercel.app/api/pipeline/candidates?tradingDay=2025-12-31&strategy=momentum_gap"

# Get active signals
curl "https://your-domain.vercel.app/api/pipeline/active?premarketDate=2025-12-31&strategy=momentum_gap"

# Get rejected candidates
curl "https://your-domain.vercel.app/api/pipeline/rejected?tradingDay=2025-12-31&strategy=momentum_gap"
```

## Next Steps

1. **Add automatic triggers** in upload handlers
2. **Update UI** to show candidates and active signals separately
3. **Add tests** for validation functions
4. **Monitor pipeline** execution and activation rates
5. **Optimize** database queries with indexes

## Files Created/Modified

### New Files:
- `api/lib/signals/pipeline-config.js`
- `api/lib/signals/candidate-builder.js`
- `api/lib/signals/candidate-activator.js`
- `api/lib/signals/pipeline-orchestrator.js`
- `api/pipeline.js`
- `INTRADAY_PIPELINE_REFACTOR.md`
- `PIPELINE_IMPLEMENTATION_SUMMARY.md`

### Modified Files:
- `api/lib/mongodb.js` - Added collection getters

## Breaking Changes

**None** - This is a completely additive implementation. The existing signal generation system remains unchanged and can run in parallel.

