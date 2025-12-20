# Signal Generation Criteria for 2025-12-19

## Strategy: Momentum Gap

### Data Requirements

**Date Used for Signals: 2025-12-19**
- **Premarket Data Date**: 2025-12-19 (today's pre-open market data)
- **Bhavcopy Data Date**: 2025-12-18 (yesterday's end-of-day data)

### Filter Criteria Applied

The strategy checks each stock in the premarket data against the following filters:

#### 1. **Basic Validation Filters**
- ✅ **Has Symbol**: Stock must have a valid symbol
- ✅ **No Duplicates**: Each symbol processed only once
- ✅ **Bhavcopy Match**: Stock must exist in yesterday's bhavcopy data
- ✅ **EQ Series**: Stock must be in EQ series (not BE, BZ, etc.)

#### 2. **Price Validation**
- ✅ **Valid Yesterday Close**: Yesterday's closing price must be > 0
- ✅ **Valid Premarket Price**: Today's premarket price (IEP) must be > 0

#### 3. **Gap-Up Filter** ⭐ **CRITICAL**
- **Minimum Gap**: `gapPercent >= 0.3%`
  - Formula: `((premarketPrice - yesterdayClose) / yesterdayClose) * 100`
  - Stocks with gap < 0.3% are rejected

#### 4. **Volume Filter** ⭐ **CRITICAL**
- **Minimum Volume**: `volume >= 100,000`
  - Stocks with volume < 100,000 are rejected

#### 5. **Scoring System** ⭐ **CRITICAL**

Each stock that passes basic filters gets a score (0-100). **Minimum score required: 50**

**Score Components:**

1. **Gap Score (0-40 points)**
   - Optimal gap: 0.5% to 2.5% → up to 40 points
   - Gap 2.5% to 5.0% → 30 points (decreasing)
   - Gap < 0.5% or > 5.0% → 0 points

2. **Near High Score (0-20 points)**
   - If premarket price is within 2% of yesterday's high → 20 points
   - Otherwise → 0 points

3. **Volume Score (0-20 points)**
   - Volume >= 1,000,000 → 20 points
   - Volume >= 500,000 → 15 points
   - Volume >= 200,000 → 10 points
   - Volume >= 100,000 → 5 points

4. **Delivery Score (0-20 points)**
   - Delivery % > 50% → 20 points
   - Delivery % > 30% → 15 points
   - Delivery % > 20% → 10 points
   - Otherwise → 0 points

**Total Score = Gap Score + Near High Score + Volume Score + Delivery Score**

- **Minimum Required**: 50 points
- Stocks with score < 50 are rejected

### Filter Counters (What Gets Tracked)

When signals are generated, the system tracks:

- `totalPremarket`: Total stocks in premarket data
- `totalBhavcopy`: Total stocks in bhavcopy data
- `noSymbol`: Stocks without valid symbol
- `duplicateSymbol`: Duplicate symbols skipped
- `noBhavcopyMatch`: Premarket stocks not found in bhavcopy
- `notEqSeries`: Stocks not in EQ series
- `invalidYesterdayClose`: Stocks with invalid yesterday close price
- `invalidPremarketPrice`: Stocks with invalid premarket price
- `gapTooSmall`: Stocks with gap < 0.3%
- `volumeTooLow`: Stocks with volume < 100,000
- `scoreTooLow`: Stocks with total score < 50
- `passed`: Stocks that passed all filters

### Why No Stocks Met Criteria for 2025-12-19

Based on the "NO_MATCH" status, this means:

1. ✅ **Data Available**: Both bhavcopy (2025-12-18) and premarket (2025-12-19) data exist
2. ✅ **Strategy Ran**: The signal generation algorithm executed successfully
3. ❌ **No Matches**: Zero stocks passed all the filters

**Most Likely Reasons:**
- **Gap too small**: Most stocks had gap < 0.3%
- **Volume too low**: Most stocks had volume < 100,000
- **Score too low**: Stocks that passed basic filters didn't reach the 50-point threshold
- **No bhavcopy match**: Premarket stocks didn't have corresponding bhavcopy data

### How to Get Detailed Breakdown

To see the exact filter counts for 2025-12-19:

1. **Via API** (with debug enabled):
   ```bash
   curl "https://nse-market-mood.vercel.app/api/signals?date=2025-12-19&strategy=momentum_gap&debug=1"
   ```

2. **Regenerate signals** (admin only):
   ```bash
   curl -X POST "https://nse-market-mood.vercel.app/api/signals" \
     -H "x-app-key: YOUR_APP_KEY" \
     -H "Content-Type: application/json" \
     -d '{"date":"2025-12-19","strategy":"momentum_gap"}'
   ```

The response will include:
- `filterCounters`: Detailed counts for each filter
- `topReason`: The filter that rejected the most stocks
- `debug.filtersUsed`: The exact filter thresholds applied
- `debug.countsBeforeFilters`: Breakdown of why stocks were filtered out

### Example Response Structure

```json
{
  "status": "NO_MATCH",
  "date": "2025-12-19",
  "strategy": "momentum_gap",
  "signal_count": 0,
  "message": "No signals generated for 2025-12-19 (no stocks met criteria)",
  "filterCounters": {
    "totalPremarket": 150,
    "totalBhavcopy": 2000,
    "noSymbol": 0,
    "duplicateSymbol": 5,
    "noBhavcopyMatch": 20,
    "notEqSeries": 0,
    "invalidYesterdayClose": 0,
    "invalidPremarketPrice": 5,
    "gapTooSmall": 100,
    "volumeTooLow": 15,
    "scoreTooLow": 5,
    "passed": 0
  },
  "topReason": "Gap too small (100)",
  "debug": {
    "filtersUsed": {
      "minGapPercent": 0.3,
      "minVolume": 100000,
      "minScore": 50,
      "series": "EQ"
    },
    "countsBeforeFilters": {
      "totalPremarket": 150,
      "totalBhavcopy": 2000,
      "gapTooSmall": 100,
      "volumeTooLow": 15,
      "scoreTooLow": 5
    }
  }
}
```

