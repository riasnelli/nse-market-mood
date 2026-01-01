# Momentum Gap Strategy - Complete Logic Explanation

## Overview
Your app uses the **Momentum Gap Strategy** which identifies stocks with gap-up openings and strong momentum indicators. The strategy operates in three modes based on market timing and data availability.

---

## Strategy Modes

### 1. **EOD Mode (End of Day / Watchlist)**
- **When**: After market hours, before premarket data is available
- **Purpose**: Creates a watchlist of potential candidates for the next trading day
- **Output**: 50-200 watchlist candidates

### 2. **PREMARKET Mode (Validated Candidates)**
- **When**: During premarket hours (9:00 AM - 9:15 AM IST)
- **Purpose**: Validates EOD candidates with actual gap data
- **Output**: 5-25 actionable signals

### 3. **LIVE Mode (Market Hours)**
- **When**: During live market hours (9:15 AM onwards)
- **Purpose**: Applies mood-based confidence adjustments to premarket signals
- **Output**: Same as premarket, but with confidence adjustments

---

## EOD Mode - Detailed Logic

### Step 1: Data Collection
- Fetches **yesterday's bhavcopy data** (EOD data from previous trading day)
- Fetches **52-week high/low data** (optional, for strength indicator)
- Fetches **market activity data** (optional, for volume ranking)

### Step 2: Filtering Criteria

#### Basic Filters:
1. **Series**: Only `EQ` (Equity) series stocks
2. **Price Range**: ₹20 to ₹2000
3. **Liquidity**: Yesterday's volume >= 200,000

#### Volatility Filter (ANY ONE must pass):
- **Option A**: `(HIGH - LOW) / CLOSE >= 1.5%` (volatility threshold)
- **Option B**: Close position in day range >= 65% (close in top 35% of range)
- **Option C**: Price move >= 1% (absolute change)

#### Strength Indicator:
- **Near 52W High**: Stock is within 8% of its 52-week high (bonus points)
- **OR Close Near High**: Close is in top 35% of day's range

### Step 3: Scoring System (0-100 points)

**Score Components:**

1. **Volatility Component (0-25 points)**
   ```
   score += Math.min(25, (volatility / 4) * 10)
   ```
   - Higher volatility = more points
   - Max 25 points for 10%+ volatility

2. **Strength Component (0-30 points)**
   ```
   if (near52WHigh) {
     score += 30  // Full points for near 52W high
   } else {
     score += closePosition * 30  // Based on close position in range
   }
   ```
   - Near 52W high: 30 points
   - Otherwise: Based on how close price is to day high (0-30 points)

3. **Price Movement Component (0-10 points)**
   ```
   if (priceChange >= 2.0%) score += 10
   else if (priceChange >= 1.0%) score += 5
   ```
   - Strong price movement adds bonus points

4. **Volume Component (0-20 points)**
   ```
   score += Math.min(20, (effectiveVol / 1,000,000) * 2)
   ```
   - 1M volume = 20 points
   - Scales linearly

5. **Delivery Component (0-15 points)**
   ```
   deliveryRatio = delivery / volume
   score += Math.min(15, deliveryRatio * 30)
   ```
   - Higher delivery % = more points
   - Max 15 points for 50%+ delivery

### Step 4: Minimum Score Threshold
- **EOD Mode**: Score >= 40 points
- Stocks below 40 are rejected

### Step 5: Entry, Target, Stop-Loss Calculation
```javascript
entry_price = yesterdayClose
stop_loss = close * 0.97  // 3% stop
target_price = close * 1.05  // 5% target
```

### Step 6: Output
- Sorted by score (descending)
- Limited to top 200 candidates
- These become the watchlist for premarket validation

---

## PREMARKET Mode - Detailed Logic

### Step 1: Start with EOD Watchlist
- Uses the 200 candidates from EOD mode as the base pool

### Step 2: Get Premarket Data
- Fetches today's premarket data (9:00 AM - 9:15 AM IST)
- Creates lookup map: symbol → {gapPercent, preMVolume, preMPrice}

### Step 3: Gap Filter
```javascript
gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100
```

**Gap Requirements:**
- **Minimum Gap**: `abs(gapPercent) >= 1.5%`
- **Maximum Gap**: `abs(gapPercent) <= 12%`
- Stocks with gaps outside this range are rejected

### Step 4: Premarket Volume Filter
- **Absolute Minimum**: Premarket volume >= 50,000
- **OR**: Skip if premarket volume field is missing/0 (field might not be available)

### Step 5: Trap Guard (Safety Filter)
```javascript
if (gapPercent > 12%) {
  relVolPreM = preMVolume / avgVol20D
  if (relVolPreM < 0.15) {
    // REJECT - High gap but low volume = potential trap
  }
}
```
- For gaps > 12%, requires relative volume >= 15% of average
- Prevents false breakouts with low volume

### Step 6: Score Update
```javascript
baseScore = candidate.score  // From EOD
if (baseScore >= 50) {
  score = baseScore + Math.min(10, gapPercent * 0.5)  // Gap bonus
} else {
  // REJECT - Score too low
}
```

**Score Requirements:**
- **Minimum Score**: 50 points (after gap bonus)
- Gap bonus: Up to 10 points based on gap size

### Step 7: Direction Determination
```javascript
direction = (gapPercent >= 1.5%) ? 'LONG' : 'SHORT'
```
- Positive gap >= 1.5% → LONG (BUY)
- Negative gap <= -1.5% → SHORT (SELL)

### Step 8: Entry, Target, Stop-Loss Update
```javascript
entry_price = preMPrice  // Use premarket price
stop_loss = entry_price * 0.97  // 3% stop
target_price = entry_price * 1.05  // 5% target
```

### Step 9: Output
- Sorted by score (descending)
- Limited to top 25 candidates
- These are the actionable signals

---

## LIVE Mode - Detailed Logic

### Step 1: Base Signals
- Uses PREMARKET mode signals as base
- If no premarket signals, falls back to EOD watchlist

### Step 2: Get Current Mood Score
- Fetches most recent market mood score (0-100)
- Mood score represents overall market sentiment

### Step 3: Confidence Adjustments

**For PREMARKET Signals:**
```javascript
if (moodScore >= 60 && direction === 'LONG') {
  confidence += 10  // Bullish mood boosts long signals
} else if (moodScore <= 40 && direction === 'SHORT') {
  confidence += 10  // Bearish mood boosts short signals
} else if (moodScore >= 60 && direction === 'SHORT') {
  confidence -= 5  // Bullish mood reduces short signals
} else if (moodScore <= 40 && direction === 'LONG') {
  confidence -= 5  // Bearish mood reduces long signals
}
```

**For EOD Watchlist (fallback):**
```javascript
if (moodScore >= 60) {
  confidence += 5  // Bullish mood: slight boost
} else if (moodScore <= 40) {
  confidence -= 5  // Bearish mood: slight reduction
}
```

### Step 4: Score Clamping
```javascript
finalScore = Math.max(0, Math.min(100, adjustedScore))
```
- Ensures score stays within 0-100 range

### Step 5: Re-sorting
- Signals are re-sorted by adjusted score
- Only re-ranks if confidence delta >= 15 points

### Step 6: Output
- Same signals as premarket, but with mood-adjusted scores
- Signals marked with `mood_adjusted: true` and `mood_score: X`

---

## Complete Filter Flow Diagram

```
START
  ↓
[EOD Mode]
  ↓
Filter: EQ series, Price ₹20-2000, Volume >= 200k
  ↓
Filter: Volatility >= 1.5% OR Close in top 35% OR Price move >= 1%
  ↓
Calculate Score (0-100)
  - Volatility: 0-25 pts
  - Strength: 0-30 pts
  - Price Movement: 0-10 pts
  - Volume: 0-20 pts
  - Delivery: 0-15 pts
  ↓
Filter: Score >= 40
  ↓
Top 200 Candidates → Watchlist
  ↓
[PREMARKET Mode]
  ↓
Filter: Gap 1.5% - 12%
  ↓
Filter: Premarket volume >= 50k (or skip if missing)
  ↓
Filter: Trap guard (for gaps > 12%)
  ↓
Update Score: baseScore + gapBonus
  ↓
Filter: Score >= 50
  ↓
Top 25 Candidates → Actionable Signals
  ↓
[LIVE Mode]
  ↓
Apply Mood Adjustments
  ↓
Re-sort by Adjusted Score
  ↓
FINAL SIGNALS
```

---

## Key Parameters Summary

| Parameter | EOD Mode | PREMARKET Mode | LIVE Mode |
|-----------|----------|----------------|-----------|
| **Min Score** | 40 | 50 | 50 (after adjustment) |
| **Gap Range** | N/A | 1.5% - 12% | 1.5% - 12% |
| **Min Volume** | 200,000 | 50,000 (prem) | 50,000 (prem) |
| **Price Range** | ₹20-2000 | ₹20-2000 | ₹20-2000 |
| **Volatility** | >= 1.5% OR top 35% | N/A | N/A |
| **Max Output** | 200 | 25 | 25 |

---

## Score Calculation Examples

### Example 1: Strong Candidate
- Volatility: 3% → 18.75 points
- Near 52W High: Yes → 30 points
- Price Change: 2.5% → 10 points
- Volume: 1.5M → 20 points
- Delivery: 45% → 13.5 points
- **Total: 92.25 points** ✅

### Example 2: Average Candidate
- Volatility: 2% → 12.5 points
- Close Position: 70% → 21 points
- Price Change: 1.2% → 5 points
- Volume: 500k → 10 points
- Delivery: 30% → 9 points
- **Total: 57.5 points** ✅

### Example 3: Weak Candidate
- Volatility: 1% → 6.25 points
- Close Position: 50% → 15 points
- Price Change: 0.3% → 0 points
- Volume: 250k → 5 points
- Delivery: 15% → 4.5 points
- **Total: 30.75 points** ❌ (Below 40 threshold)

---

## Rejection Reasons Tracked

The system tracks why stocks are rejected:

1. **NOT_EQ**: Not equity series
2. **GAP_TOO_SMALL**: Gap < 1.5%
3. **GAP_TOO_LARGE**: Gap > 12%
4. **PREM_VOL_TOO_LOW_ABS**: Premarket volume < 50k
5. **SCORE_TOO_LOW**: Score below threshold
6. **LIQUIDITY_TOO_LOW**: Volume < 200k
7. **PRICE_OUT_OF_RANGE**: Price < ₹20 or > ₹2000
8. **VOLATILITY_TOO_LOW**: Volatility < 1.5% AND not in top 35%
9. **NOT_NEAR_HIGH**: Close not in top 35% of range
10. **TRAP_GUARD**: High gap (>12%) but low relative volume (<15%)

---

## Data Sources

1. **Bhavcopy**: Yesterday's end-of-day data (close, high, low, volume, delivery)
2. **Premarket**: Today's pre-open data (IEP, gap%, premarket volume)
3. **52W Data**: 52-week high/low for strength indicator
4. **Market Activity**: Turnover, trades count (optional)
5. **Market Mood**: Current market sentiment score (for LIVE mode)

---

## Entry/Stop/Target Logic

### Entry Price:
- **EOD Mode**: Yesterday's close (estimate)
- **PREMARKET Mode**: Premarket price (IEP)
- **LIVE Mode**: Same as premarket

### Stop Loss:
```javascript
stop_loss = entry_price * 0.97  // 3% below entry
```

### Target Price:
```javascript
target_price = entry_price * 1.05  // 5% above entry
```

**Risk-Reward Ratio**: 1:1.67 (3% risk, 5% reward)

---

## Why Your Signals Show Specific Stocks

Based on the 39 signals you're seeing, these stocks passed:

1. ✅ **Basic Filters**: EQ series, price ₹20-2000, volume >= 200k
2. ✅ **Volatility/Strength**: Either volatile OR closed near high OR had price move
3. ✅ **EOD Score**: Scored >= 40 points
4. ✅ **Gap Filter**: Gap between 1.5% - 12%
5. ✅ **Premarket Volume**: >= 50k (or field missing)
6. ✅ **Final Score**: >= 50 points (after gap bonus)
7. ✅ **Top 25**: Ranked in top 25 by score

The signals are sorted by score (highest first), so the first signal has the strongest combination of:
- Gap size
- Volatility
- Strength (near high/52W high)
- Volume
- Delivery percentage

---

## How to Verify Your Signals

To see why specific stocks were selected or rejected, check the diagnostics in the API response:

```javascript
{
  diagnostics: {
    GAP_TOO_SMALL: 150,
    SCORE_TOO_LOW: 45,
    // ... other rejection counts
  },
  rejectStats: [
    { ruleId: 'GAP_TOO_SMALL', label: 'Gap too small (< 1.5%)', rejectedCount: 150 },
    { ruleId: 'SCORE_TOO_LOW', label: 'Score too low', rejectedCount: 45 }
  ]
}
```

This shows exactly how many stocks were rejected for each reason.

