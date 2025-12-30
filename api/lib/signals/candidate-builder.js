/**
 * Candidate Builder (Phase 1)
 * 
 * Builds candidates for the NEXT trading day using ONLY today's EOD data.
 * TODAY premarket is NEVER used - it's stale once market closes.
 * 
 * This runs after market close to prepare a watchlist for tomorrow.
 */

const {
  getDailyBhavcopyCollection,
  getUploadedDataCollection
} = require('../mongodb');
const { nextTradingDay } = require('../tradingCalendar');
const { getStrategy } = require('./registry');
const { MODE_EOD } = require('./mode');

/**
 * Build candidates from EOD data
 * 
 * @param {string} eodDate - Today's EOD date (YYYY-MM-DD)
 * @param {string} strategy - Strategy name (e.g., 'momentum_gap')
 * @param {Object} params - Strategy-specific parameters
 * @returns {Promise<Object>} - { success, candidates, diagnostics, meta }
 */
async function buildCandidatesFromEOD(eodDate, strategy = 'momentum_gap', params = {}) {
  try {
    console.log(`📋 [Candidate Builder] Building candidates for next day using EOD: ${eodDate}, strategy: ${strategy}`);
    
    // Get strategy definition
    const strategyDef = getStrategy(strategy);
    if (!strategyDef) {
      return {
        success: false,
        candidates: [],
        diagnostics: {},
        message: `Unknown strategy: ${strategy}`
      };
    }
    
    // Check if strategy supports EOD mode
    if (!strategyDef.supportedModes || !strategyDef.supportedModes.includes(MODE_EOD)) {
      return {
        success: false,
        candidates: [],
        diagnostics: {},
        message: `Strategy ${strategy} does not support EOD mode`
      };
    }
    
    // Get next trading day (the day these candidates are for)
    const nextTradingDate = nextTradingDay(eodDate);
    if (!nextTradingDate) {
      return {
        success: false,
        candidates: [],
        diagnostics: {},
        message: `Could not determine next trading day after ${eodDate}`
      };
    }
    
    // Run strategy in EOD mode to get watchlist candidates
    // IMPORTANT: This uses ONLY EOD data, NO premarket
    const eodResult = await strategyDef.run({
      date: nextTradingDate, // Target date is tomorrow
      mode: MODE_EOD,
      eodDate: eodDate, // Use today's EOD
      preMDate: null, // NO PREMARKET - this is the key fix
      moodScore: null,
      params: params
    });
    
    if (!eodResult.success) {
      return {
        success: false,
        candidates: [],
        diagnostics: eodResult.diagnostics || {},
        message: eodResult.message || 'Failed to generate candidates'
      };
    }
    
    // Transform signals into candidates
    const candidates = eodResult.signals.map(signal => ({
      symbol: signal.symbol,
      strategy: strategy,
      bias: signal.direction || 'LONG', // LONG or SHORT
      keyLevels: {
        entry: signal.entry_price || signal.close || 0,
        stopLoss: signal.stop_loss || 0,
        target1: signal.target_price || 0,
        trigger: signal.entry_price || signal.close || 0 // For breakout strategies
      },
      confidenceBase: signal.score || 0,
      reasons: signal.reason ? [signal.reason] : [],
      volume: signal.volume || 0,
      volatility: signal.volatility_percent || 0,
      strength: signal.strength || null,
      createdAt: new Date(),
      tradingDay: nextTradingDate, // The day these candidates are for
      eodDate: eodDate, // The EOD data used to build this candidate
      // Store original signal data for reference
      _originalSignal: {
        score: signal.score,
        gap_percent: signal.gap_percent || 0,
        near_high: signal.near_high || false
      }
    }));
    
    // Sort by confidence (score) descending
    candidates.sort((a, b) => b.confidenceBase - a.confidenceBase);
    
    console.log(`✅ [Candidate Builder] Generated ${candidates.length} candidates for ${nextTradingDate}`);
    
    return {
      success: true,
      candidates: candidates,
      diagnostics: eodResult.diagnostics || {},
      meta: {
        eodDate: eodDate,
        tradingDay: nextTradingDate,
        strategy: strategy,
        candidateCount: candidates.length,
        filtersUsed: eodResult.meta?.filtersUsed || [],
        rejectStats: eodResult.meta?.rejectStats || []
      },
      message: `Generated ${candidates.length} candidates for ${nextTradingDate} using EOD from ${eodDate}`
    };
    
  } catch (error) {
    console.error('❌ [Candidate Builder] Error:', error);
    return {
      success: false,
      candidates: [],
      diagnostics: {},
      message: `Error building candidates: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Sanity check: Ensure candidates don't depend on premarket
 * 
 * @param {Array} candidates - Array of candidate objects
 * @returns {boolean} - True if valid (no premarket dependency)
 */
function validateCandidatesNoPremarket(candidates) {
  // Check that no candidate has premarket-derived fields
  const invalidCandidates = candidates.filter(c => {
    return c.gap_percent !== undefined && c.gap_percent !== 0 ||
           c.preM_volume !== undefined ||
           c.premarketPrice !== undefined ||
           c.premarketDate !== undefined;
  });
  
  if (invalidCandidates.length > 0) {
    console.warn('⚠️ [Candidate Builder] Found candidates with premarket data:', invalidCandidates.length);
    return false;
  }
  
  return true;
}

module.exports = {
  buildCandidatesFromEOD,
  validateCandidatesNoPremarket
};

