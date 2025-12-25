# Trading Strategy Logic Documentation

## Overview
This document details the exact logic for each of the 5 trading strategies implemented in the signals generation system. All strategies can work with or without premarket data.

---

## 1. Momentum Gap Strategy

### Strategy ID: `momentum_gap`
### Description
Identifies stocks with gap-up openings and strong momentum indicators. The strategy looks for stocks that are opening higher than yesterday's close with strong volume and price action.

### Data Requirements
- **Required**: Yesterday's bhavcopy data
- **Optional**: Today's premarket data (works without it)

### Logic Flow

#### A. With Premarket Data

**Step 1: Data Collection**
- Gets yesterday's bhavcopy data (EQ series only)
- Gets today's premarket data
- Creates lookup maps for both datasets

**Step 2: Filtering Criteria**
For each stock with premarket data:

1. **Symbol Validation**
   - Must have valid symbol
   - No duplicate symbols
   - Must match in both bhavcopy and premarket

2. **Series Filter**
   - Only EQ (Equity) series stocks

3. **Price Validation**
   - `yesterdayClose` > 0
   - `premarketPrice` > 0

4. **Gap Calculation**
   ```javascript
   gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100
   ```
   - **Minimum Gap**: >= 0.3% (rejects smaller gaps)

5. **Near High Detection**
   ```javascript
   nearHighPercent = ((yesterdayHigh - premarketPrice) / yesterdayHigh) * 100
   nearHigh = Math.abs(nearHighPercent) <= 2.0
   ```
   - Checks if premarket price is within 2% of yesterday's high

6. **Volume Filter**
   - Minimum volume: 100,000
   - Volume scoring:
     - >= 1,000,000: 20 points
     - >= 500,000: 15 points
     - >= 200,000: 10 points
     - >= 100,000: 5 points

**Step 3: Scoring System**
```javascript
totalScore = gapScore + nearHighScore + volumeScore + deliveryScore
```

- **Gap Score** (0-40 points):
  - Optimal gap: 0.5% to 2.5%
  - If gap is 0.5-2.5%: `40 - (distance from 1.5% * 20)`
  - If gap is 2.5-5.0%: `30 - ((gap - 2.5) * 4)`
  - Outside range: 0 points

- **Near High Score**: 20 points (if within 2% of yesterday's high)

- **Volume Score**: 5-20 points (based on volume tiers above)

- **Delivery Score** (0-20 points):
  - Delivery % > 50: 20 points
  - Delivery % > 30: 15 points
  - Delivery % > 20: 10 points
  - Otherwise: 0 points

**Step 4: Minimum Score Threshold**
- **Minimum Score**: 50 points
- Stocks below 50 are rejected

**Step 5: Entry, Target, Stop-Loss Calculation**
```javascript
entryPrice = premarketPrice
atr = bhavcopy.atr20 || (yesterdayClose * 0.02)  // Default 2% ATR
stopLoss = entryPrice - (atr * 1.5)
targetPrice = entryPrice + (atr * 2.5)
```

**Step 6: Signal Generation**
- Sorts all signals by score (descending)
- Takes top 10 signals
- Returns signals with metadata

#### B. Without Premarket Data

**Step 1: Data Collection**
- Gets yesterday's bhavcopy data only
- No premarket data available

**Step 2: Momentum-Based Filtering**
For each stock in bhavcopy:

1. **Basic Filters** (same as above)
   - Symbol validation
   - EQ series only
   - Valid yesterday close
   - Volume >= 100,000

2. **Momentum Indicators from Yesterday**
   - `pChange`: Yesterday's percentage change
   - `yesterdayHigh`: Yesterday's high price
   - `yesterdayClose`: Yesterday's close price
   - `deliveryPercent`: Delivery percentage

**Step 3: Momentum Scoring**
```javascript
// Momentum Score (0-40 points)
if (pChange >= 2) momentumScore = 40
else if (pChange >= 1) momentumScore = 30
else if (pChange >= 0.5) momentumScore = 20
else if (pChange > 0) momentumScore = 10
else momentumScore = 0

// Near High Score (0-20 points)
nearHighScore = (close within 2% of high) ? 20 : 0

// Volume Score (5-20 points) - same as with premarket

// Delivery Score (0-20 points) - same as with premarket
```

**Step 4: Total Score**
```javascript
totalScore = momentumScore + nearHighScore + volumeScore + deliveryScore
```
- **Minimum Score**: 50 points

**Step 5: Entry, Target, Stop-Loss**
```javascript
entryPrice = yesterdayClose  // Estimate, will update when premarket available
atr = bhavcopy.atr20 || (yesterdayClose * 0.02)
stopLoss = entryPrice - (atr * 1.5)
targetPrice = entryPrice + (atr * 2.5)
```

**Step 6: Signal Metadata**
- `has_premarket: false`
- `gap_percent: 0`
- Reason includes: "Based on yesterday data (premarket pending)"

### Output
- Top 10 signals sorted by score
- Each signal includes: symbol, entry_price, target_price, stop_loss, score, reason, confidence_score

---

## 2. Breakout Strategy

### Strategy ID: `breakout`
### Description
Focuses on stocks breaking out of consolidation patterns with high volume. Requires stronger volume confirmation than momentum gap.

### Data Requirements
- **Required**: Yesterday's bhavcopy data
- **Optional**: Today's premarket data

### Logic Flow

**Step 1: Base Generation**
- Calls `generateSimpleMomentumGapSignals()` to get base signals
- Uses all momentum gap logic (with or without premarket)

**Step 2: Breakout-Specific Filter**
```javascript
breakoutSignals = baseSignals.filter(signal => {
    const volume = signal.volume || 0;
    return volume >= 200000;  // 2x minimum volume requirement
})
```

**Step 3: Signal Transformation**
- Updates reason: Replaces "Gap-up" with "Breakout"
- Sets `strategy: 'breakout'`

### Key Differences from Momentum Gap
- **Higher Volume Requirement**: 200,000 minimum (vs 100,000)
- **Focus**: Breakout patterns rather than just gap-ups
- **Same Scoring**: Uses momentum gap scoring system

### Output
- Filtered signals from momentum gap (volume >= 200,000)
- Top signals sorted by score

---

## 3. Mean Reversion Strategy

### Strategy ID: `mean_reversion`
### Description
Identifies oversold stocks that may revert to their mean (yesterday's close). Looks for stocks that are down but not too much, near their lows.

### Data Requirements
- **Required**: Yesterday's bhavcopy data
- **Optional**: Today's premarket data

### Logic Flow

#### A. With Premarket Data

**Step 1: Data Collection**
- Gets yesterday's bhavcopy data
- Gets today's premarket data

**Step 2: Oversold Detection**
For each stock with premarket data:

1. **Gap Calculation**
   ```javascript
   gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100
   ```

2. **Oversold Filter**
   - Gap must be negative but not too negative: `-5% < gapPercent < 0%`
   - Stocks down 0-5% are considered oversold

3. **Near Low Detection**
   ```javascript
   yesterdayLow = bhavcopy.low || yesterdayClose
   nearLow = Math.abs((premarketPrice - yesterdayLow) / yesterdayLow) <= 0.02
   ```
   - Premarket price must be within 2% of yesterday's low

4. **Volume Filter**
   - Minimum volume: 100,000

**Step 3: Scoring**
```javascript
score = 50 + (Math.abs(gapPercent) * 5)
```
- Base score: 50
- More oversold = higher score (up to 75 for -5% gap)

**Step 4: Entry, Target, Stop-Loss**
```javascript
entryPrice = premarketPrice
atr = bhavcopy.atr20 || (yesterdayClose * 0.02)
stopLoss = entryPrice - (atr * 1.5)
targetPrice = yesterdayClose  // Target is mean reversion to yesterday's close
```

**Step 5: Signal Generation**
- Reason: "Oversold X%, mean reversion play"
- Sorts by score, takes top 10

#### B. Without Premarket Data

**Step 1: Data Collection**
- Gets yesterday's bhavcopy data only

**Step 2: Yesterday's Oversold Detection**
For each stock in bhavcopy:

1. **Yesterday's Change**
   ```javascript
   pChange = bhavcopy.pChange || bhavcopy.PCHANGE || 0
   ```

2. **Oversold Filter**
   - Must be down yesterday: `-5% < pChange < 0%`

3. **Near Low Detection**
   ```javascript
   yesterdayLow = bhavcopy.low || yesterdayClose
   nearLow = Math.abs((yesterdayClose - yesterdayLow) / yesterdayLow) <= 0.02
   ```
   - Yesterday's close must be within 2% of yesterday's low

4. **Volume Filter**
   - Minimum volume: 100,000

**Step 3: Scoring**
```javascript
score = 50 + (Math.abs(pChange) * 5)
```
- Same scoring as with premarket

**Step 4: Entry, Target, Stop-Loss**
```javascript
entryPrice = yesterdayClose  // Estimate
atr = bhavcopy.atr20 || (yesterdayClose * 0.02)
stopLoss = entryPrice - (atr * 1.5)
targetPrice = yesterdayClose * 1.02  // Target 2% above entry (mean reversion)
```

**Step 5: Signal Metadata**
- `has_premarket: false`
- Reason: "Oversold X% yesterday, mean reversion play (premarket pending)"

### Key Characteristics
- **Target**: Mean reversion to yesterday's close (or 2% above if no premarket)
- **Entry**: Oversold price (premarket or yesterday's close)
- **Focus**: Stocks that are down but not crashed

### Output
- Top 10 oversold stocks sorted by score
- Signals marked for mean reversion

---

## 4. Defensive Strategy

### Strategy ID: `defensive`
### Description
Very conservative approach - only high-quality setups with strong scores. Waits for the best opportunities.

### Data Requirements
- **Required**: Yesterday's bhavcopy data
- **Optional**: Today's premarket data

### Logic Flow

**Step 1: Base Generation**
- Calls `generateSimpleMomentumGapSignals()` to get base signals
- Uses all momentum gap logic (with or without premarket)

**Step 2: Defensive Filter**
```javascript
defensiveSignals = baseSignals.filter(signal => {
    return signal.score >= 70;  // Only high-quality signals
})
```

**Step 3: Signal Transformation**
- Updates reason: Prepends "Defensive: " to reason
- Sets `strategy: 'defensive'`

### Key Characteristics
- **Minimum Score**: 70 (vs 50 for momentum gap)
- **Quality Over Quantity**: Only the best setups
- **Conservative**: Fewer signals, higher confidence

### Output
- Only signals with score >= 70
- Top signals sorted by score

---

## 5. Volatility Play Strategy

### Strategy ID: `volatility_play`
### Description
Focuses on high-volatility stocks with strong momentum. Uses wider stops and targets to account for volatility.

### Data Requirements
- **Required**: Yesterday's bhavcopy data
- **Optional**: Today's premarket data

### Logic Flow

**Step 1: Base Generation**
- Calls `generateSimpleMomentumGapSignals()` to get base signals
- Uses all momentum gap logic (with or without premarket)

**Step 2: Volatility Filter**
```javascript
volatilitySignals = baseSignals.filter(signal => {
    const gapPercent = signal.gap_percent || 0;
    return gapPercent >= 1.0;  // Higher gap requirement
})
```

**Step 3: Adjust Targets for Volatility**
```javascript
entryPrice = signal.entry_price
atr = entryPrice * 0.03  // Higher ATR (3% vs 2%)
stopLoss = entryPrice - (atr * 2)  // Wider stop (2x ATR vs 1.5x)
targetPrice = entryPrice + (atr * 3)  // Higher target (3x ATR vs 2.5x)
```

**Step 4: Signal Transformation**
- Updates stop_loss and target_price with wider ranges
- Updates reason: Prepends "Volatility: " to reason
- Sets `strategy: 'volatility_play'`

### Key Characteristics
- **Higher Gap Requirement**: >= 1.0% (vs 0.3% for momentum gap)
- **Wider Stops**: 2x ATR (vs 1.5x)
- **Higher Targets**: 3x ATR (vs 2.5x)
- **Higher ATR**: 3% (vs 2%)

### Output
- Signals with gap >= 1.0%
- Wider stop-loss and target ranges
- Top signals sorted by score

---

## Common Elements Across All Strategies

### Data Sources
1. **Bhavcopy Collection**: `daily_bhavcopy` (yesterday's EOD data)
2. **Uploaded Bhavcopy**: `uploaded_data` collection (type: 'bhav')
3. **Premarket Collection**: `premarket_data` (today's pre-open data)
4. **Uploaded Premarket**: `uploaded_data` collection (type: 'premarket')

### Common Filters
- **Series**: Only EQ (Equity) series
- **Symbol Validation**: Must have valid symbol
- **Volume**: Minimum 100,000 (breakout requires 200,000)
- **Price Validation**: All prices must be > 0

### Common Calculations
- **ATR**: Uses `bhavcopy.atr20` or defaults to 2% of close price
- **Stop-Loss**: Typically `entryPrice - (atr * 1.5)` (volatility play uses 2x)
- **Target**: Typically `entryPrice + (atr * 2.5)` (volatility play uses 3x)

### Signal Output Format
```javascript
{
    symbol: string,
    entry_price: number,
    target_price: number,
    stop_loss: number,
    side: 'BUY',
    score: number (0-100),
    reason: string,
    confidence_score: number (0-1),
    gap_percent: number,
    near_high: boolean,
    volume: number,
    delivery_percent: number,
    has_premarket: boolean
}
```

### Sorting & Limiting
- All strategies sort signals by score (descending)
- Top 10 signals are returned
- Signals are saved to `signals_store` collection

---

## Strategy Comparison Table

| Strategy | Min Gap | Min Volume | Min Score | Stop-Loss | Target | Focus |
|----------|---------|-----------|----------|-----------|--------|-------|
| Momentum Gap | 0.3% | 100,000 | 50 | 1.5x ATR | 2.5x ATR | Gap-up momentum |
| Breakout | 0.3% | 200,000 | 50 | 1.5x ATR | 2.5x ATR | Breakout patterns |
| Mean Reversion | -5% to 0% | 100,000 | 50 | 1.5x ATR | Mean (close) | Oversold stocks |
| Defensive | 0.3% | 100,000 | 70 | 1.5x ATR | 2.5x ATR | High-quality only |
| Volatility Play | 1.0% | 100,000 | 50 | 2.0x ATR | 3.0x ATR | High volatility |

---

## Notes

1. **All strategies work without premarket data** - they use yesterday's momentum/performance indicators
2. **Signals are marked** with `has_premarket: true/false` to indicate data source
3. **When premarket becomes available**, signals can be regenerated for more accurate entry prices
4. **Score calculation** varies by strategy but all use similar components (gap, volume, delivery, momentum)
5. **Top 10 signals** are always returned, sorted by score descending
6. **Signals are saved** to `signals_store` collection with status: READY | NO_MATCH | INSUFFICIENT_DATA | ERROR

