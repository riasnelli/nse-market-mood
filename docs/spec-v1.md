# NSE Market Mood – Intraday Engine Spec (v1)

## Goal

Extend the existing NSE Market Mood PWA so that, based only on uploaded bhavcopy + indices + pre-open CSVs, it can:

- Compute daily market mood & regime
- Generate a small set of intraday signals (top 5–10 stocks) with deterministic rules
- Backtest those signals EOD using the next bhavcopy
- Use OpenRouter AI only to explain the signals and performance in plain language

**Important**: We do NOT want AI to invent signals or strategies. All trading rules must live in our code and be reproducible.

---

## Data Collections (MongoDB)

### `daily_bhavcopy`

- `date` (YYYY-MM-DD)
- `symbol`, `series`
- `open`, `high`, `low`, `close`, `prev_close`
- `volume`, `delivery_volume`, `delivery_percentage`
- **derived**: `atr20`, `rs20`, `avg_vol20`, `high_52w`, `low_52w` (can be added later)

### `daily_indices`

- `date`
- `symbol` (e.g. "NIFTY 50", "BANKNIFTY", "INDIA VIX")
- `last_price`, `change`, `change_percent`
- `high`, `low`, `volume`

### `pre_market_data`

- `date`
- `symbol`
- `pre_open_price`
- `change_percent`
- `total_buy_quantity`
- `total_sell_quantity`
- **derived**: `gap_percent`, `preopen_value`, etc.

### `signal_run`

- `run_id` (uuid)
- `date`
- `session` ("PREOPEN" | "EOD_BACKTEST")
- `regime_code` ("STRONG_BULL" | "RANGE" | "WEAK" | "PANIC")
- `strategies_used` (array of strings)
- `params_hash` (hash of strategy config)
- `created_at`

### `signal`

- `run_id`
- `date`
- `symbol`
- `strategy_name`
- `side` ("BUY" | "SELL")
- `score` (0–100)
- `entry_price`
- `stop_loss`
- `target_price`
- `confidence_score` (0–1, deterministic from factors)
- `feature_fields` used for scoring (`gap%`, `rs20`, `vol_surge`, `near_high_flag`, `liquidity_bucket`)
- `ai_explanation` (string, optional)

### `signal_performance`

- `run_id`
- `symbol`
- `date`
- `exit_reason` ("TARGET_HIT" | "STOP_LOSS_HIT" | "EOD_EXIT")
- `return_percent`
- `max_favourable_move_percent`
- `max_drawdown_percent`
- `success` (bool)

### `strategy_performance` (daily aggregate per strategy)

- `strategy_name`
- `date`
- `total_signals`
- `successful_signals`
- `success_rate`
- `average_return`
- `last_updated`

---

## Upload Pipeline

Implement `EnhancedUploadManager` with handlers for:

### Bhavcopy Upload

- Parse DAT/CSV, validate, insert into `daily_bhavcopy`
- After insert, recompute indicators (ATR, RS, avg volume) using last N days and update today's docs

### Indices Upload

- Parse indices CSV from Dhan
- Insert into `daily_indices`
- From today's indices + breadth compute:
  - `mood_score` (0–100)
  - `mood_label` ("Very Bullish", etc.)
  - `regime_code`
- Store regime info in a separate `market_day` document or derive it from `daily_indices` on demand

### Pre-market Upload

- Parse NSE pre-open CSV
- Insert into `pre_market_data`
- Join with yesterday's `daily_bhavcopy` to compute:
  - `gap_percent`
  - `vol_surge` (vs 20D avg volume)
  - `near_high_flag` (within X% of 52W high)
  - `liquidity_bucket`

**Note**: After bhavcopy + indices + pre-open exist for a date, we should be able to run the signal engine.

---

## Strategy Engine (v1, Deterministic)

For now we only implement one strategy: `intraday_momentum_gap`.

### Rules (Example)

**Inputs from bhav + pre-open:**

- `gap%` between +0.3% and +3%
- `rs20 ≥ 4`
- `vol_surge ≥ 1.5x`
- `near_high_flag = true`
- `liquidity_bucket` in ["MEDIUM", "HIGH"]

**Score Calculation:**

- gap band score (0–25)
- rs20 score (0–20)
- vol_surge score (0–20)
- near_high bonus (0 or 15)
- liquidity score (0–10)
- atr_quality score (0–10)
- **total scaled to 0–100**

### Engine Process

1. Reads `pre_market_data` + `daily_bhavcopy` for a date
2. Computes features & scores for all F&O or liquid stocks
3. Keeps only stocks above a score threshold (e.g. ≥ 60)
4. Sorts descending, takes top N (max 10)
5. Writes one `signal_run` + N `signal` documents

**Important**: The engine must be a pure function (same inputs → same signals).

---

## AI Usage (OpenRouter)

AI is only used for:

### Explaining a Signal in Plain Language

- **Input**: A single signal object + its feature values + `regime_code`
- **Output**: 1–2 sentences (stored as `ai_explanation`)

### Explaining Daily Backtest Results

- **Input**: Aggregated `strategy_performance` for last N days
- **Output**: A short paragraph summary for users

**Constraint**: No AI is allowed to change which stocks are picked, their entry/stop/target, or their score.

---

## Backtesting (EOD)

After bhavcopy for a date is uploaded:

1. For each signal in the corresponding `signal_run`:
   - Look up the EOD candle for that symbol from `daily_bhavcopy`
   - Simulate:
     - Did high hit target?
     - Did low hit stop?
     - Else exit at close
   - Compute `return_percent`, `exit_reason`, `success`, etc.
   - Insert into `signal_performance`

2. Then aggregate per `strategy_name` and write/update `strategy_performance`

---

## Tasks for Cursor (v1)

1. **Implement Mongo models/collections** as above

2. **Implement upload APIs for:**
   - `/api/upload/bhavcopy`
   - `/api/upload/indices`
   - `/api/upload/preopen`

3. **Implement a pure `generateMomentumGapSignals(date)` function that:**
   - Joins bhav + pre-open
   - Computes features, scores
   - Writes `signal_run` + `signal` docs

4. **Wire the existing Signals tab UI to:**
   - Load latest `signal_run` for today
   - Show top 5–10 signals including score, entry, SL, target, `ai_explanation` (placeholder string for now)
