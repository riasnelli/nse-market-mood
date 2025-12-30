/**
 * Candidate Activator (Phase 2)
 * 
 * Activates candidates using TOMORROW's premarket data.
 * Validates gap%, volume, index alignment, and price levels.
 * 
 * This runs after tomorrow's premarket data is available.
 */

const {
  getPreMarketDataCollection,
  getDailyIndicesCollection,
  getUploadedDataCollection
} = require('../mongodb');
const config = require('./pipeline-config');

/**
 * Get premarket data for a date
 */
async function getPremarketData(premarketDate) {
  try {
    const premarketCollection = await getPreMarketDataCollection();
    const uploadedPreMCollection = await getUploadedDataCollection('premarket');
    
    let premarketData = new Map();
    
    // Try official premarket collection
    const preMDocs = await premarketCollection.find({ date: premarketDate }).toArray();
    for (const doc of preMDocs) {
      if (doc.indices && Array.isArray(doc.indices)) {
        for (const item of doc.indices) {
          if (item.symbol) {
            premarketData.set(item.symbol.toUpperCase(), {
              gapPercent: item.gapPercent || item.gap_percent || item.GAP_PERCENT || 0,
              preMVolume: item.preMVolume || item.prem_volume || item.PREM_VOLUME || item.volume || 0,
              preMPrice: item.preMPrice || item.prem_price || item.PREM_PRICE || item.lastPrice || 0,
              date: premarketDate
            });
          }
        }
      }
    }
    
    // Try uploaded premarket if official collection is empty
    if (premarketData.size === 0) {
      const uploadedPreMDocs = await uploadedPreMCollection.find({ date: premarketDate }).toArray();
      for (const doc of uploadedPreMDocs) {
        if (doc.indices && Array.isArray(doc.indices)) {
          for (const item of doc.indices) {
            if (item.symbol) {
              premarketData.set(item.symbol.toUpperCase(), {
                gapPercent: item.gapPercent || item.gap_percent || item.GAP_PERCENT || 0,
                preMVolume: item.preMVolume || item.prem_volume || item.PREM_VOLUME || item.volume || 0,
                preMPrice: item.preMPrice || item.prem_price || item.PREM_PRICE || item.lastPrice || 0,
                date: premarketDate
              });
            }
          }
        }
      }
    }
    
    return premarketData;
  } catch (error) {
    console.error('Error fetching premarket data:', error);
    return new Map();
  }
}

/**
 * Get index data for alignment check
 */
async function getIndexData(date) {
  try {
    const indicesCollection = await getDailyIndicesCollection();
    const indexDoc = await indicesCollection
      .find({ date: date })
      .sort({ uploadedAt: -1 })
      .limit(1)
      .toArray();
    
    if (indexDoc.length > 0 && indexDoc[0].indices) {
      const nifty = indexDoc[0].indices.find(i => i.symbol === 'NIFTY 50');
      const banknifty = indexDoc[0].indices.find(i => i.symbol === 'NIFTY BANK');
      
      return {
        nifty: nifty ? {
          change: nifty.change || 0,
          pChange: nifty.pChange || 0
        } : null,
        banknifty: banknifty ? {
          change: banknifty.change || 0,
          pChange: banknifty.pChange || 0
        } : null
      };
    }
    
    return { nifty: null, banknifty: null };
  } catch (error) {
    console.error('Error fetching index data:', error);
    return { nifty: null, banknifty: null };
  }
}

/**
 * Check index alignment
 * Returns true if index direction aligns with candidate bias
 */
function checkIndexAlignment(candidate, indexData) {
  if (!config.INDEX_ALIGNMENT_REQUIRED) {
    return { aligned: true, reason: 'INDEX_ALIGNMENT_NOT_REQUIRED' };
  }
  
  // If no index data, skip alignment check (don't reject)
  if (!indexData.nifty && !indexData.banknifty) {
    return { aligned: true, reason: 'NO_INDEX_DATA' };
  }
  
  // Check NIFTY direction
  const niftyDirection = indexData.nifty?.pChange >= 0 ? 'LONG' : 'SHORT';
  const bankniftyDirection = indexData.banknifty?.pChange >= 0 ? 'LONG' : 'SHORT';
  
  // For LONG candidates, index should be positive or neutral
  // For SHORT candidates, index should be negative or neutral
  if (candidate.bias === 'LONG') {
    const niftyAligned = !indexData.nifty || indexData.nifty.pChange >= -0.5; // Allow small negative
    const bankniftyAligned = !indexData.banknifty || indexData.banknifty.pChange >= -0.5;
    
    if (niftyAligned && bankniftyAligned) {
      return { aligned: true, reason: 'INDEX_ALIGNED' };
    } else {
      return { aligned: false, reason: 'INDEX_CONFLICT', details: `NIFTY: ${indexData.nifty?.pChange?.toFixed(2)}%, BANK: ${indexData.banknifty?.pChange?.toFixed(2)}%` };
    }
  } else if (candidate.bias === 'SHORT') {
    const niftyAligned = !indexData.nifty || indexData.nifty.pChange <= 0.5; // Allow small positive
    const bankniftyAligned = !indexData.banknifty || indexData.banknifty.pChange <= 0.5;
    
    if (niftyAligned && bankniftyAligned) {
      return { aligned: true, reason: 'INDEX_ALIGNED' };
    } else {
      return { aligned: false, reason: 'INDEX_CONFLICT', details: `NIFTY: ${indexData.nifty?.pChange?.toFixed(2)}%, BANK: ${indexData.banknifty?.pChange?.toFixed(2)}%` };
    }
  }
  
  return { aligned: true, reason: 'UNKNOWN_BIAS' };
}

/**
 * Activate candidates with premarket data
 * 
 * @param {Array} candidates - Array of candidate objects from Phase 1
 * @param {string} premarketDate - Tomorrow's premarket date (YYYY-MM-DD)
 * @param {string} strategy - Strategy name
 * @returns {Promise<Object>} - { success, activeSignals, rejectedCandidates, diagnostics }
 */
async function activateCandidatesWithPremarket(candidates, premarketDate, strategy = 'momentum_gap') {
  try {
    console.log(`🚀 [Candidate Activator] Activating ${candidates.length} candidates for ${premarketDate}, strategy: ${strategy}`);
    
    // Sanity check: premarket date must match candidate trading day
    const candidateTradingDay = candidates[0]?.tradingDay;
    if (candidateTradingDay && candidateTradingDay !== premarketDate) {
      return {
        success: false,
        activeSignals: [],
        rejectedCandidates: [],
        diagnostics: {},
        message: `Premarket date mismatch: candidates for ${candidateTradingDay}, premarket for ${premarketDate}`
      };
    }
    
    // Get premarket data
    const premarketData = await getPremarketData(premarketDate);
    if (premarketData.size === 0) {
      return {
        success: false,
        activeSignals: [],
        rejectedCandidates: candidates.map(c => ({
          candidate: c,
          reason: config.REJECTION_REASONS.DATA_MISSING,
          details: 'No premarket data available'
        })),
        diagnostics: {},
        message: `No premarket data available for ${premarketDate}`
      };
    }
    
    // Get index data for alignment check
    const indexData = await getIndexData(premarketDate);
    
    // Get gap bounds for strategy
    const gapBounds = config.GAP_BOUNDS[strategy] || config.GAP_BOUNDS.momentum_gap;
    
    const activeSignals = [];
    const rejectedCandidates = [];
    const diagnostics = {
      totalCandidates: candidates.length,
      activated: 0,
      rejected: 0,
      rejectionReasons: {}
    };
    
    // Process each candidate
    for (const candidate of candidates) {
      const symbol = candidate.symbol.toUpperCase();
      const preM = premarketData.get(symbol);
      
      // Check if premarket data exists
      if (!preM) {
        rejectedCandidates.push({
          candidate: candidate,
          reason: config.REJECTION_REASONS.DATA_MISSING,
          details: 'No premarket data for symbol',
          timestamp: new Date()
        });
        diagnostics.rejected++;
        diagnostics.rejectionReasons[config.REJECTION_REASONS.DATA_MISSING] = 
          (diagnostics.rejectionReasons[config.REJECTION_REASONS.DATA_MISSING] || 0) + 1;
        continue;
      }
      
      // Validate premarket date matches
      if (preM.date !== premarketDate) {
        rejectedCandidates.push({
          candidate: candidate,
          reason: config.REJECTION_REASONS.PREM_DATE_MISMATCH,
          details: `Premarket date ${preM.date} != ${premarketDate}`,
          timestamp: new Date()
        });
        diagnostics.rejected++;
        continue;
      }
      
      // Check gap bounds
      const gapPercent = preM.gapPercent;
      const gapAbs = Math.abs(gapPercent);
      
      if (gapAbs < gapBounds.min || gapAbs > gapBounds.max) {
        rejectedCandidates.push({
          candidate: candidate,
          reason: config.REJECTION_REASONS.GAP_OUT_OF_RANGE,
          details: `Gap ${gapPercent.toFixed(2)}% outside bounds [${gapBounds.min}%, ${gapBounds.max}%]`,
          timestamp: new Date()
        });
        diagnostics.rejected++;
        diagnostics.rejectionReasons[config.REJECTION_REASONS.GAP_OUT_OF_RANGE] = 
          (diagnostics.rejectionReasons[config.REJECTION_REASONS.GAP_OUT_OF_RANGE] || 0) + 1;
        continue;
      }
      
      // Check premarket volume
      const preMVolume = preM.preMVolume || 0;
      const avgVol20D = candidate.volume || 0;
      const relVol = avgVol20D > 0 ? preMVolume / avgVol20D : 0;
      
      if (preMVolume > 0) {
        // If volume data is available, enforce minimums
        if (preMVolume < config.MIN_PREMARKET_ABS_VOL && relVol < config.MIN_PREMARKET_RELVOL) {
          rejectedCandidates.push({
            candidate: candidate,
            reason: config.REJECTION_REASONS.LOW_RELVOL,
            details: `Volume too low: ${preMVolume} (abs) / ${(relVol * 100).toFixed(1)}% (rel)`,
            timestamp: new Date()
          });
          diagnostics.rejected++;
          diagnostics.rejectionReasons[config.REJECTION_REASONS.LOW_RELVOL] = 
            (diagnostics.rejectionReasons[config.REJECTION_REASONS.LOW_RELVOL] || 0) + 1;
          continue;
        }
      }
      // If volume is 0/missing, skip volume check (field might not be available)
      
      // Check index alignment
      const alignmentCheck = checkIndexAlignment(candidate, indexData);
      if (!alignmentCheck.aligned) {
        rejectedCandidates.push({
          candidate: candidate,
          reason: config.REJECTION_REASONS.INDEX_CONFLICT,
          details: alignmentCheck.details || 'Index direction conflicts with candidate bias',
          timestamp: new Date()
        });
        diagnostics.rejected++;
        diagnostics.rejectionReasons[config.REJECTION_REASONS.INDEX_CONFLICT] = 
          (diagnostics.rejectionReasons[config.REJECTION_REASONS.INDEX_CONFLICT] || 0) + 1;
        continue;
      }
      
      // Check price relative to trigger (for breakout strategies)
      if (candidate.keyLevels.trigger && preM.preMPrice) {
        const triggerPrice = candidate.keyLevels.trigger;
        const padding = triggerPrice * (config.ENTRY_PADDING / 100);
        const minEntryPrice = triggerPrice + padding;
        
        if (preM.preMPrice < minEntryPrice) {
          rejectedCandidates.push({
            candidate: candidate,
            reason: config.REJECTION_REASONS.BELOW_TRIGGER,
            details: `Premarket price ${preM.preMPrice} below trigger ${minEntryPrice.toFixed(2)}`,
            timestamp: new Date()
          });
          diagnostics.rejected++;
          diagnostics.rejectionReasons[config.REJECTION_REASONS.BELOW_TRIGGER] = 
            (diagnostics.rejectionReasons[config.REJECTION_REASONS.BELOW_TRIGGER] || 0) + 1;
          continue;
        }
      }
      
      // All checks passed - activate the candidate
      const activeSignal = {
        symbol: candidate.symbol,
        strategy: strategy,
        direction: candidate.bias,
        entry_price: preM.preMPrice || candidate.keyLevels.entry,
        stop_loss: candidate.keyLevels.stopLoss,
        target_price: candidate.keyLevels.target1,
        score: candidate.confidenceBase + Math.min(10, gapAbs * 0.5), // Add gap bonus
        gap_percent: gapPercent,
        preM_volume: preMVolume,
        rel_vol_prem: relVol,
        reason: `${candidate.bias} gap ${gapPercent.toFixed(2)}%, relVol ${(relVol * 100).toFixed(1)}%, Score: ${Math.round(candidate.confidenceBase + Math.min(10, gapAbs * 0.5))}`,
        mode: 'PREMARKET',
        candidateId: candidate._id || null, // Link back to candidate
        activatedAt: new Date(),
        premarketDate: premarketDate,
        eodDate: candidate.eodDate,
        // Store validation details
        validation: {
          gapChecked: true,
          volumeChecked: preMVolume > 0,
          indexAligned: alignmentCheck.reason,
          priceAboveTrigger: true
        }
      };
      
      activeSignals.push(activeSignal);
      diagnostics.activated++;
    }
    
    // Sort active signals by score descending
    activeSignals.sort((a, b) => b.score - a.score);
    
    // Limit to top N per strategy
    const topNSignals = activeSignals.slice(0, config.TOP_N_PER_STRATEGY);
    
    console.log(`✅ [Candidate Activator] Activated ${topNSignals.length} signals, rejected ${rejectedCandidates.length}`);
    
    return {
      success: true,
      activeSignals: topNSignals,
      rejectedCandidates: rejectedCandidates,
      diagnostics: diagnostics,
      meta: {
        premarketDate: premarketDate,
        strategy: strategy,
        totalCandidates: candidates.length,
        activated: topNSignals.length,
        rejected: rejectedCandidates.length,
        topNLimit: config.TOP_N_PER_STRATEGY
      },
      message: `Activated ${topNSignals.length} signals from ${candidates.length} candidates`
    };
    
  } catch (error) {
    console.error('❌ [Candidate Activator] Error:', error);
    return {
      success: false,
      activeSignals: [],
      rejectedCandidates: [],
      diagnostics: {},
      message: `Error activating candidates: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Sanity check: Ensure premarket date matches trading day
 */
function validatePremarketDateMatch(candidates, premarketDate) {
  const candidateTradingDay = candidates[0]?.tradingDay;
  if (!candidateTradingDay) {
    return { valid: false, reason: 'Candidates missing tradingDay field' };
  }
  
  if (candidateTradingDay !== premarketDate) {
    return { 
      valid: false, 
      reason: `Date mismatch: candidates for ${candidateTradingDay}, premarket for ${premarketDate}` 
    };
  }
  
  return { valid: true };
}

module.exports = {
  activateCandidatesWithPremarket,
  validatePremarketDateMatch,
  getPremarketData,
  getIndexData
};

