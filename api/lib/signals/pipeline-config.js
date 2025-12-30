/**
 * Intraday Signal Pipeline Configuration
 * 
 * This pipeline fixes the conceptual issue where "tomorrow signals" were generated
 * using TODAY EOD + TODAY premarket. Today's premarket is stale once market closes.
 * 
 * SOLUTION: 2-Phase Pipeline
 * Phase 1 (After Market Close): Build CANDIDATES using only TODAY EOD
 * Phase 2 (Tomorrow Premarket): ACTIVATE candidates using TOMORROW premarket
 * 
 * TODAY premarket must NEVER influence tomorrow signals.
 */

module.exports = {
  // Top N signals per strategy to show as active
  TOP_N_PER_STRATEGY: 8,
  
  // Gap bounds per strategy (for activation phase)
  GAP_BOUNDS: {
    momentum_gap: { min: 1.5, max: 12 },
    breakout: { min: 0.5, max: 5.0 },
    mean_reversion: { min: -5.0, max: 0 }, // Negative gaps only
    defensive: { min: 0.3, max: 3.0 },
    volatility_play: { min: 1.0, max: 15.0 }
  },
  
  // Minimum premarket relative volume (as ratio of avg 20D volume)
  MIN_PREMARKET_RELVOL: 0.05, // 5% of average volume
  
  // Minimum absolute premarket volume (fallback if relVol not available)
  MIN_PREMARKET_ABS_VOL: 50000,
  
  // Require index alignment (NIFTY/BANKNIFTY direction must not conflict)
  INDEX_ALIGNMENT_REQUIRED: true,
  
  // Entry padding above trigger level (for breakout strategies)
  ENTRY_PADDING: 0.05, // 0.05% above trigger
  
  // Stop loss and target multipliers (if using ATR)
  SL_ATR_MULT: 1.5,
  T1_R_MULT: 2.5,
  
  // Rejection reason codes
  REJECTION_REASONS: {
    GAP_OUT_OF_RANGE: 'GAP_OUT_OF_RANGE',
    LOW_RELVOL: 'LOW_RELVOL',
    INDEX_CONFLICT: 'INDEX_CONFLICT',
    BELOW_TRIGGER: 'BELOW_TRIGGER',
    DATA_MISSING: 'DATA_MISSING',
    SCORE_TOO_LOW: 'SCORE_TOO_LOW',
    PREM_DATE_MISMATCH: 'PREM_DATE_MISMATCH'
  }
};

