/**
 * Clean Momentum Gap Strategy
 * 
 * Mode-aware implementation:
 * - MODE_EOD: Watchlist candidates (no gap usage)
 * - MODE_PREM: Validated candidates with gap filters
 * - MODE_LIVE: Confidence adjustments only
 */

const {
  getDailyBhavcopyCollection,
  getPreMarketDataCollection,
  getUploadedDataCollection
} = require('../../mongodb');
const { prevTradingDay } = require('../../tradingCalendar');
const { MODE_EOD, MODE_PREM, MODE_LIVE } = require('../mode');

// Default parameters
const DEFAULTS = {
  gapMin: 1.5,
  gapMax: 12,
  preMMinAbs: 25000,
  preMMinRel: 0.05,
  eodScoreMin: 45,
  preMScoreMin: 50,
  series: 'EQ',
  priceMin: 20,
  priceMax: 2000,
  liquidityMin: 300000,
  volatilityMin: 1.5, // ATR% or HighLow%
  closeNearHighMin: 0.70,
  extremeGapMode: false
};

// Diagnostics rejection reasons
const REJECTION_REASONS = {
  NOT_EQ: 'NOT_EQ',
  GAP_TOO_SMALL: 'GAP_TOO_SMALL',
  GAP_TOO_LARGE: 'GAP_TOO_LARGE',
  PREM_VOL_TOO_LOW_ABS: 'PREM_VOL_TOO_LOW_ABS',
  PREM_VOL_TOO_LOW_REL: 'PREM_VOL_TOO_LOW_REL',
  SCORE_TOO_LOW: 'SCORE_TOO_LOW',
  LIQUIDITY_TOO_LOW: 'LIQUIDITY_TOO_LOW',
  PRICE_OUT_OF_RANGE: 'PRICE_OUT_OF_RANGE',
  VOLATILITY_TOO_LOW: 'VOLATILITY_TOO_LOW',
  NOT_NEAR_HIGH: 'NOT_NEAR_HIGH',
  TRAP_GUARD: 'TRAP_GUARD'
};

/**
 * Calculate average volume over 20 days (fallback to EOD volume if not available)
 */
async function getAvgVol20D(symbol, eodDate, eodVolume) {
  // TODO: If avgVol20D is stored in DB, fetch it here
  // For now, fallback to EOD volume
  return eodVolume;
}

/**
 * Calculate ATR%14 (fallback to HighLow% if not available)
 */
function getVolatilityProxy(high, low, close) {
  // TODO: If ATR%14 is stored, use it
  // Fallback: HighLow%
  const highLowPercent = ((high - low) / close) * 100;
  return highLowPercent;
}

/**
 * Momentum Gap - MODE_EOD (Watchlist only)
 */
async function runMomentumGapEOD(date, eodDate, params = {}) {
  const config = { ...DEFAULTS, ...params };
  const diagnostics = {};
  
  // Initialize diagnostics counters
  Object.values(REJECTION_REASONS).forEach(reason => {
    diagnostics[reason] = 0;
  });
  
  const bhavcopyCollection = await getDailyBhavcopyCollection();
  const uploadedBhavCollection = await getUploadedDataCollection('bhav');
  const maCollection = await getUploadedDataCollection('marketactivity');
  const w52Collection = await getUploadedDataCollection('52w');
  
  // Get bhavcopy data
  let bhavcopyData = [];
  try {
    bhavcopyData = await bhavcopyCollection
      .find({ date: eodDate, series: 'EQ' })
      .toArray();
    
    if (bhavcopyData.length === 0) {
      const uploadedBhavDocs = await uploadedBhavCollection
        .find({ date: eodDate })
        .toArray();
      
      for (const doc of uploadedBhavDocs) {
        if (doc.indices && Array.isArray(doc.indices)) {
          const eqStocks = doc.indices.filter(item => !item.series || item.series === 'EQ');
          bhavcopyData = bhavcopyData.concat(eqStocks);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching bhavcopy:', error);
    return {
      success: false,
      signals: [],
      diagnostics,
      message: `Error fetching bhavcopy data for ${eodDate}`
    };
  }
  
  // Get 52W data
  let w52Data = new Map();
  try {
    const w52Docs = await w52Collection.find({ date: eodDate }).toArray();
    for (const doc of w52Docs) {
      if (doc.indices && Array.isArray(doc.indices)) {
        for (const item of doc.indices) {
          if (item.symbol) {
            w52Data.set(item.symbol, {
              high52w: item.high52w || item['52W_HIGH'] || item.high_52w,
              low52w: item.low52w || item['52W_LOW'] || item.low_52w
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn('Warning: Could not fetch 52W data:', error.message);
  }
  
  const watchlistCandidates = [];
  
  for (const stock of bhavcopyData) {
    const symbol = stock.symbol || stock.SYMBOL;
    if (!symbol) continue;
    
    const close = parseFloat(stock.close || stock.CLOSE || stock.lastPrice || 0);
    const open = parseFloat(stock.open || stock.OPEN || 0);
    const high = parseFloat(stock.high || stock.HIGH || close);
    const low = parseFloat(stock.LOW || stock.low || close);
    const volume = parseFloat(stock.volume || stock.VOLUME || stock.totalTradedVolume || 0);
    const delivery = parseFloat(stock.delivery || stock.DELIVERY || stock.deliveryQty || 0);
    
    // Series filter
    const series = stock.series || stock.SERIES || 'EQ';
    if (series !== 'EQ') {
      diagnostics[REJECTION_REASONS.NOT_EQ]++;
      continue;
    }
    
    // Price range
    if (close < config.priceMin || close > config.priceMax) {
      diagnostics[REJECTION_REASONS.PRICE_OUT_OF_RANGE]++;
      continue;
    }
    
    // Liquidity
    const avgVol20D = await getAvgVol20D(symbol, eodDate, volume);
    if (avgVol20D < config.liquidityMin) {
      diagnostics[REJECTION_REASONS.LIQUIDITY_TOO_LOW]++;
      continue;
    }
    
    // Volatility
    const volatility = getVolatilityProxy(high, low, close);
    if (volatility < config.volatilityMin) {
      diagnostics[REJECTION_REASONS.VOLATILITY_TOO_LOW]++;
      continue;
    }
    
    // Strength: Close near high
    const dayRange = high - low;
    const closePosition = dayRange > 0 ? (close - low) / dayRange : 0;
    if (closePosition < config.closeNearHighMin) {
      diagnostics[REJECTION_REASONS.NOT_NEAR_HIGH]++;
      continue;
    }
    
    // Optional: Near 52W high
    let near52WHigh = false;
    const w52 = w52Data.get(symbol);
    if (w52 && w52.high52w && w52.high52w > 0) {
      const distFrom52WHigh = ((close / w52.high52w) - 1) * 100;
      near52WHigh = distFrom52WHigh >= -8 && distFrom52WHigh <= 0;
    }
    
    // Calculate score (0-100)
    let score = 0;
    
    // Volatility component (0-25)
    score += Math.min(25, (volatility / 4) * 10);
    
    // Strength component (0-30)
    if (near52WHigh) {
      score += 30;
    } else {
      score += closePosition * 30; // Based on close position
    }
    
    // Volume component (0-20)
    score += Math.min(20, (avgVol20D / 1000000) * 2);
    
    // Delivery component (0-15)
    if (delivery > 0 && volume > 0) {
      const deliveryRatio = delivery / volume;
      score += Math.min(15, deliveryRatio * 30);
    }
    
    // Score threshold
    if (score < config.eodScoreMin) {
      diagnostics[REJECTION_REASONS.SCORE_TOO_LOW]++;
      continue;
    }
    
    watchlistCandidates.push({
      symbol,
      entry_price: close,
      stop_loss: parseFloat((close * 0.97).toFixed(2)),
      target_price: parseFloat((close * 1.05).toFixed(2)),
      score: Math.round(score),
      gap_percent: 0, // No gap in EOD mode
      volume: avgVol20D,
      reason: near52WHigh 
        ? `Near 52W High, Score: ${Math.round(score)}`
        : `Close near high (${(closePosition * 100).toFixed(0)}%), Score: ${Math.round(score)}`,
      strategy: 'momentum_gap',
      mode: 'EOD',
      strength: near52WHigh ? '52W_HIGH' : 'CLOSE_NEAR_HIGH',
      volatility_percent: volatility.toFixed(2)
    });
  }
  
  // Sort by score descending
  watchlistCandidates.sort((a, b) => b.score - a.score);
  
  // Limit to 200 candidates
  const finalSignals = watchlistCandidates.slice(0, 200);
  
  return {
    success: true,
    signals: finalSignals,
    diagnostics,
    message: finalSignals.length > 0
      ? `Generated ${finalSignals.length} watchlist candidates (EOD mode)`
      : `No watchlist candidates (EOD mode)`
  };
}

/**
 * Momentum Gap - MODE_PREM (Validated candidates)
 */
async function runMomentumGapPREM(date, eodDate, params = {}) {
  const config = { ...DEFAULTS, ...params };
  const diagnostics = {};
  
  // Initialize diagnostics
  Object.values(REJECTION_REASONS).forEach(reason => {
    diagnostics[reason] = 0;
  });
  
  // First, get EOD watchlist as base pool
  const eodResult = await runMomentumGapEOD(date, eodDate, params);
  if (!eodResult.success) {
    return eodResult;
  }
  
  // Get premarket data
  const premarketCollection = await getPreMarketDataCollection();
  const uploadedPreMCollection = await getUploadedDataCollection('premarket');
  
  let premarketData = new Map();
  try {
    const preMDocs = await premarketCollection.find({ date: date }).toArray();
    for (const doc of preMDocs) {
      if (doc.indices && Array.isArray(doc.indices)) {
        for (const item of doc.indices) {
          if (item.symbol) {
            premarketData.set(item.symbol, {
              gapPercent: item.gapPercent || item.gap_percent || item.GAP_PERCENT || 0,
              preMVolume: item.preMVolume || item.prem_volume || item.PREM_VOLUME || item.volume || 0,
              preMPrice: item.preMPrice || item.prem_price || item.PREM_PRICE || item.lastPrice || 0
            });
          }
        }
      }
    }
    
    // Check uploaded premarket
    if (premarketData.size === 0) {
      const uploadedPreMDocs = await uploadedPreMCollection.find({ date: date }).toArray();
      for (const doc of uploadedPreMDocs) {
        if (doc.indices && Array.isArray(doc.indices)) {
          for (const item of doc.indices) {
            if (item.symbol) {
              premarketData.set(item.symbol, {
                gapPercent: item.gapPercent || item.gap_percent || item.GAP_PERCENT || 0,
                preMVolume: item.preMVolume || item.prem_volume || item.PREM_VOLUME || item.volume || 0,
                preMPrice: item.preMPrice || item.prem_price || item.PREM_PRICE || item.lastPrice || 0
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching premarket data:', error);
    return {
      success: false,
      signals: [],
      diagnostics,
      message: `Error fetching premarket data for ${date}`
    };
  }
  
  if (premarketData.size === 0) {
    return {
      success: false,
      signals: [],
      diagnostics,
      message: `No premarket data available for ${date}`
    };
  }
  
  // Filter EOD candidates with premarket validation
  const validatedCandidates = [];
  
  for (const candidate of eodResult.signals) {
    const symbol = candidate.symbol;
    const preM = premarketData.get(symbol);
    
    if (!preM) continue; // Skip if no premarket data
    
    const gapPercent = Math.abs(preM.gapPercent);
    const preMVolume = preM.preMVolume;
    const avgVol20D = candidate.volume; // From EOD result
    
    // Gap tier filter
    if (gapPercent < config.gapMin) {
      diagnostics[REJECTION_REASONS.GAP_TOO_SMALL]++;
      continue;
    }
    
    // Extreme gap mode check
    if (!config.extremeGapMode && gapPercent > config.gapMax) {
      diagnostics[REJECTION_REASONS.GAP_TOO_LARGE]++;
      continue;
    }
    
    if (config.extremeGapMode && (gapPercent < 12 || gapPercent > 30)) {
      diagnostics[REJECTION_REASONS.GAP_TOO_LARGE]++;
      continue;
    }
    
    // Premarket volume filter (relative)
    const preMMinRel = Math.max(config.preMMinAbs, config.preMMinRel * avgVol20D);
    if (preMVolume < preMMinRel) {
      if (preMVolume < config.preMMinAbs) {
        diagnostics[REJECTION_REASONS.PREM_VOL_TOO_LOW_ABS]++;
      } else {
        diagnostics[REJECTION_REASONS.PREM_VOL_TOO_LOW_REL]++;
      }
      continue;
    }
    
    // Trap guard: If gap > 12% and relVol < 0.15, reject
    if (gapPercent > 12) {
      const relVolPreM = avgVol20D > 0 ? preMVolume / avgVol20D : 0;
      if (relVolPreM < 0.15) {
        diagnostics[REJECTION_REASONS.TRAP_GUARD]++;
        continue;
      }
    }
    
    // Direction
    const direction = preM.gapPercent >= config.gapMin ? 'LONG' : 'SHORT';
    
    // Update score (add premarket confirmation bonus)
    let score = candidate.score;
    if (score >= config.preMScoreMin) {
      // Add gap strength bonus
      score += Math.min(10, gapPercent * 0.5);
    } else {
      diagnostics[REJECTION_REASONS.SCORE_TOO_LOW]++;
      continue;
    }
    
    validatedCandidates.push({
      ...candidate,
      entry_price: preM.preMPrice || candidate.entry_price,
      gap_percent: preM.gapPercent,
      score: Math.round(score),
      direction,
      preM_volume: preMVolume,
      rel_vol_prem: avgVol20D > 0 ? (preMVolume / avgVol20D).toFixed(2) : '0',
      reason: `${direction} gap ${preM.gapPercent.toFixed(2)}%, relVol ${(preMVolume / avgVol20D * 100).toFixed(1)}%, Score: ${Math.round(score)}`,
      mode: 'PREMARKET',
      strategy: 'momentum_gap'
    });
  }
  
  // Sort by score descending
  validatedCandidates.sort((a, b) => b.score - a.score);
  
  // Limit to 25 candidates
  const finalSignals = validatedCandidates.slice(0, 25);
  
  return {
    success: true,
    signals: finalSignals,
    diagnostics,
    message: finalSignals.length > 0
      ? `Generated ${finalSignals.length} validated candidates (Premarket mode)`
      : `No validated candidates (Premarket mode)`
  };
}

/**
 * Momentum Gap - MODE_LIVE (Confidence adjustment only)
 */
async function runMomentumGapLIVE(date, eodDate, moodScore, params = {}) {
  // Use PREM list as base, or fallback to EOD watchlist
  const preMResult = await runMomentumGapPREM(date, eodDate, params);
  
  if (!preMResult.success || preMResult.signals.length === 0) {
    // Fallback to EOD watchlist
    const eodResult = await runMomentumGapEOD(date, eodDate, params);
    if (!eodResult.success) {
      return eodResult;
    }
    
    // Apply mood-based confidence adjustments to EOD watchlist
    const adjustedSignals = eodResult.signals.map(signal => {
      let confidence = signal.score;
      
      // Mood bias (simple adjustment)
      if (moodScore >= 60) {
        // Bullish mood: boost long candidates
        confidence += 5;
      } else if (moodScore <= 40) {
        // Bearish mood: reduce confidence
        confidence -= 5;
      }
      
      return {
        ...signal,
        score: Math.max(0, Math.min(100, Math.round(confidence))),
        mode: 'LIVE',
        mood_adjusted: true,
        mood_score: moodScore
      };
    });
    
    return {
      ...eodResult,
      signals: adjustedSignals,
      message: `Live-adjusted watchlist (${adjustedSignals.length} candidates)`
    };
  }
  
  // Apply mood-based confidence to PREM signals
  const adjustedSignals = preMResult.signals.map(signal => {
    let confidence = signal.score;
    
    // Mood bias
    if (moodScore >= 60 && signal.direction === 'LONG') {
      confidence += 10;
    } else if (moodScore <= 40 && signal.direction === 'SHORT') {
      confidence += 10;
    } else if (moodScore >= 60 && signal.direction === 'SHORT') {
      confidence -= 5;
    } else if (moodScore <= 40 && signal.direction === 'LONG') {
      confidence -= 5;
    }
    
    return {
      ...signal,
      score: Math.max(0, Math.min(100, Math.round(confidence))),
      mode: 'LIVE',
      mood_adjusted: true,
      mood_score: moodScore
    };
  });
  
  // Re-sort by adjusted score
  adjustedSignals.sort((a, b) => b.score - a.score);
  
  return {
    ...preMResult,
    signals: adjustedSignals,
    message: `Live-adjusted signals (${adjustedSignals.length} candidates)`
  };
}

/**
 * Main entry point for Momentum Gap strategy
 */
async function runMomentumGap({ date, mode, eodDate, preMDate, moodScore = null, params = {} }) {
  switch (mode) {
    case MODE_EOD:
      return await runMomentumGapEOD(date, eodDate, params);
    
    case MODE_PREM:
      return await runMomentumGapPREM(date, eodDate, params);
    
    case MODE_LIVE:
      return await runMomentumGapLIVE(date, eodDate, moodScore, params);
    
    default:
      return {
        success: false,
        signals: [],
        diagnostics: {},
        message: `Unsupported mode: ${mode}`
      };
  }
}

module.exports = {
  runMomentumGap,
  DEFAULTS,
  REJECTION_REASONS
};

