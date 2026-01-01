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
  getUploadedDataCollection,
  getEODCandidatesCollection
} = require('../../mongodb');
const { prevTradingDay } = require('../../tradingCalendar');
const { MODE_EOD, MODE_PREM, MODE_LIVE } = require('../mode');

// Default parameters (sane defaults for NSE)
const DEFAULTS = {
  gapMin: 1.5,        // Minimum gap % (was 30%, now 1.5%)
  gapMax: 12,         // Maximum gap % (was unlimited, now 12%)
  preMMinAbs: 50000,  // Minimum premarket volume (absolute)
  preMMinRel: 0.05,   // Minimum relative volume (5% of avg)
  eodScoreMin: 40,    // EOD watchlist score threshold (reduced from 45)
  preMScoreMin: 50,   // Premarket confirmed score threshold
  series: 'EQ',
  priceMin: 20,
  priceMax: 2000,
  liquidityMin: 200000, // Reduced from 300k to 200k for more candidates
  volatilityMin: 1.5,    // Reduced from 2.0% to 1.5% OR close in top 35% of range
  closeNearHighMin: 0.65, // Reduced from 0.70 to 0.65 (close in top 35% instead of 30%)
  extremeGapMode: false
};

/**
 * Strategy Rules (for UI display)
 */
const RULES_TEXT = {
  EOD: [
    'Series: EQ',
    'Price: ₹20–₹2000',
    'Liquidity: Yesterday volume >= 200,000',
    'Volatility: (HIGH-LOW)/CLOSE >= 1.5% OR close in top 35% OR price move >= 1%',
    'Score threshold: >= 40',
    'Output: Watchlist candidates (50–200 typical)'
  ],
  PREMARKET: [
    'Start from EOD shortlist',
    'Gap filter: abs(gap%) >= 1.5% and <= 12%',
    'Premarket volume: >= 50,000 (or skip if field missing)',
    'Score threshold: >= 50 (after premarket confirmation)',
    'Output: Actionable list (5–25 typical)'
  ],
  LIVE: [
    'Use PREMARKET list as base',
    'Apply mood-based confidence adjustments only',
    'Do NOT reshuffle list every 30s',
    'Only re-rank if confidence delta >= 15 or stop condition triggered'
  ]
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
 * Store EOD candidates in cache for future premarket validation
 */
async function storeEODCandidates(date, candidates, strategy = 'momentum_gap') {
  try {
    const eodCandidatesCollection = await getEODCandidatesCollection();
    await eodCandidatesCollection.updateOne(
      { date: date, strategy: strategy },
      {
        $set: {
          date: date,
          strategy: strategy,
          candidates: candidates,
          count: candidates.length,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log(`✅ [MomentumGap] Cached ${candidates.length} EOD candidates for ${date}`);
  } catch (error) {
    console.error(`❌ [MomentumGap] Error storing EOD candidates for ${date}:`, error);
  }
}

/**
 * Load cached EOD candidates from database
 */
async function loadEODCandidates(date, strategy = 'momentum_gap') {
  try {
    const eodCandidatesCollection = await getEODCandidatesCollection();
    const cached = await eodCandidatesCollection.findOne({ date: date, strategy: strategy });
    if (cached && cached.candidates && Array.isArray(cached.candidates)) {
      console.log(`✅ [MomentumGap] Loaded ${cached.candidates.length} cached EOD candidates for ${date}`);
      return cached.candidates;
    }
    return null;
  } catch (error) {
    console.error(`❌ [MomentumGap] Error loading cached EOD candidates for ${date}:`, error);
    return null;
  }
}

/**
 * Find the most recent EOD date before target date
 * Searches up to 10 trading days back
 */
async function findMostRecentEODDate(targetDate) {
  const targetDateObj = new Date(targetDate);
  let searchDate = new Date(targetDateObj);
  searchDate.setDate(searchDate.getDate() - 1);
  
  const bhavcopyCollection = await getDailyBhavcopyCollection();
  const uploadedBhavCollection = await getUploadedDataCollection('bhav');
  
  // Search up to 10 days back
  for (let i = 0; i < 10; i++) {
    // Skip weekends
    while (searchDate.getDay() === 0 || searchDate.getDay() === 6) {
      searchDate.setDate(searchDate.getDate() - 1);
    }
    
    const dateStr = searchDate.toISOString().split('T')[0];
    
    // Check daily_bhavcopy collection
    const bhavData = await bhavcopyCollection.findOne({
      date: dateStr,
      series: 'EQ'
    });
    
    if (bhavData) {
      console.log(`✅ [MomentumGap] Found EOD data for: ${dateStr}`);
      return dateStr;
    }
    
    // Check uploaded bhavcopy collection
    const uploadedBhav = await uploadedBhavCollection.findOne({
      date: dateStr
    });
    
    if (uploadedBhav && uploadedBhav.indices && Array.isArray(uploadedBhav.indices) && uploadedBhav.indices.length > 0) {
      console.log(`✅ [MomentumGap] Found uploaded EOD data for: ${dateStr}`);
      return dateStr;
    }
    
    // Try next day back
    searchDate.setDate(searchDate.getDate() - 1);
  }
  
  console.warn(`⚠️ [MomentumGap] No EOD data found in last 10 trading days before ${targetDate}`);
  return null;
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
    
    console.log(`[MomentumGap EOD] Found ${bhavcopyData.length} EQ stocks in daily_bhavcopy for ${eodDate}`);
    
    if (bhavcopyData.length === 0) {
      const uploadedBhavDocs = await uploadedBhavCollection
        .find({ date: eodDate })
        .toArray();
      
      console.log(`[MomentumGap EOD] Found ${uploadedBhavDocs.length} uploaded bhavcopy docs for ${eodDate}`);
      
      for (const doc of uploadedBhavDocs) {
        if (doc.indices && Array.isArray(doc.indices)) {
          const eqStocks = doc.indices.filter(item => !item.series || item.series === 'EQ');
          bhavcopyData = bhavcopyData.concat(eqStocks);
        }
      }
      
      console.log(`[MomentumGap EOD] Total EQ stocks from uploaded data: ${bhavcopyData.length}`);
    }
    
    if (bhavcopyData.length === 0) {
      console.warn(`[MomentumGap EOD] No bhavcopy data found for ${eodDate}`);
      return {
        success: false,
        signals: [],
        diagnostics,
        message: `No bhavcopy data found for ${eodDate}`
      };
    }
  } catch (error) {
    console.error(`[MomentumGap EOD] Error fetching bhavcopy for ${eodDate}:`, error);
    return {
      success: false,
      signals: [],
      diagnostics,
      message: `Error fetching bhavcopy data for ${eodDate}: ${error.message}`
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
    
    const close = parseFloat(stock.close || stock.CLOSE || stock.lastPrice || stock.LAST_PRICE || 0);
    const open = parseFloat(stock.open || stock.OPEN || stock.PREV_CLOSE || stock.prevClose || close);
    const high = parseFloat(stock.high || stock.HIGH || close);
    const low = parseFloat(stock.LOW || stock.low || close);
    // Try multiple volume field names (NSE CSV uses TOTTRDQTY)
    const volume = parseFloat(
      stock.volume || 
      stock.VOLUME || 
      stock.totalTradedVolume || 
      stock.TOTTRDQTY || 
      stock.tottrdqty ||
      stock.traded_quantity ||
      stock.TRADED_QUANTITY ||
      0
    );
    const delivery = parseFloat(
      stock.delivery || 
      stock.DELIVERY || 
      stock.deliveryQty || 
      stock.DELIVERY_QTY ||
      stock.delivery_qty ||
      0
    );
    
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
    
    // Liquidity check - use volume directly if avgVol20D not available
    const avgVol20D = await getAvgVol20D(symbol, eodDate, volume);
    const effectiveVolume = avgVol20D || volume; // Fallback to current volume if avg not available
    
    if (effectiveVolume < config.liquidityMin) {
      diagnostics[REJECTION_REASONS.LIQUIDITY_TOO_LOW]++;
      continue;
    }
    
    // Volatility: (HIGH-LOW)/CLOSE >= threshold OR close in top X% of range
    const volatility = getVolatilityProxy(high, low, close);
    const dayRange = high - low;
    const closePosition = dayRange > 0 ? (close - low) / dayRange : 0;
    
    // Check volatility OR close position (either condition passes)
    const volatilityPass = volatility >= config.volatilityMin;
    const closePositionPass = closePosition >= config.closeNearHighMin;
    
    // Also allow if price moved significantly (change > 1%)
    const priceChange = close > 0 ? Math.abs((close - open) / close) * 100 : 0;
    const priceMovePass = priceChange >= 1.0;
    
    if (!volatilityPass && !closePositionPass && !priceMovePass) {
      // Failed all three: volatility too low AND not near high AND no significant price move
      if (volatility < config.volatilityMin) {
        diagnostics[REJECTION_REASONS.VOLATILITY_TOO_LOW]++;
      } else if (closePosition < config.closeNearHighMin) {
        diagnostics[REJECTION_REASONS.NOT_NEAR_HIGH]++;
      }
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
    
    // Price movement component (0-10) - NEW
    if (priceChange >= 2.0) {
      score += 10;
    } else if (priceChange >= 1.0) {
      score += 5;
    }
    
    // Volume component (0-20)
    const effectiveVol = avgVol20D || volume;
    score += Math.min(20, (effectiveVol / 1000000) * 2);
    
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
      volume: avgVol20D || volume,
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
  
  // Log diagnostics for debugging
  console.log(`[MomentumGap EOD] Processed ${bhavcopyData.length} stocks, found ${finalSignals.length} candidates`);
  const totalRejected = Object.values(diagnostics).reduce((sum, count) => sum + count, 0);
  console.log(`[MomentumGap EOD] Total rejected: ${totalRejected}, Accepted: ${finalSignals.length}`);
  if (finalSignals.length === 0 && bhavcopyData.length > 0) {
    const topRejections = Object.entries(diagnostics)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    console.warn(`[MomentumGap EOD] No signals found. Top rejection reasons:`, topRejections.map(([reason, count]) => `${reason}: ${count}`).join(', '));
  }
  
  // Get top rejection reasons
  const rejectStats = Object.entries(diagnostics)
    .filter(([_, count]) => count > 0)
    .map(([reason, count]) => ({
      ruleId: reason,
      label: getRejectionLabel(reason),
      rejectedCount: count
    }))
    .sort((a, b) => b.rejectedCount - a.rejectedCount);
  
  // Get filters used for this mode
  const filtersUsed = [
    { label: 'Series', value: config.series },
    { label: 'Price Range', value: `₹${config.priceMin}–₹${config.priceMax}` },
    { label: 'Liquidity', value: `>= ${(config.liquidityMin / 1000).toFixed(0)}k` },
    { label: 'Volatility', value: `>= ${config.volatilityMin}% OR close in top 30%` },
    { label: 'Score Min', value: config.eodScoreMin }
  ];
  
  // Cache EOD candidates for future premarket validation
  if (finalSignals.length > 0) {
    await storeEODCandidates(eodDate, finalSignals, 'momentum_gap');
  }
  
  return {
    success: true,
    signals: finalSignals,
    diagnostics,
    meta: {
      rejectStats,
      filtersUsed,
      modeDisplay: 'EOD',
      dataUsed: { eodDate }
    },
    message: finalSignals.length > 0
      ? `Generated ${finalSignals.length} watchlist candidates (EOD mode)`
      : `No watchlist candidates (EOD mode)`
  };
}

/**
 * Get human-readable label for rejection reason
 */
function getRejectionLabel(reason) {
  const labels = {
    NOT_EQ: 'Not EQ series',
    GAP_TOO_SMALL: 'Gap too small (< 1.5%)',
    GAP_TOO_LARGE: 'Gap too large (> 12%)',
    PREM_VOL_TOO_LOW_ABS: 'Premarket volume too low (< 50k)',
    PREM_VOL_TOO_LOW_REL: 'Premarket relative volume too low',
    SCORE_TOO_LOW: 'Score too low',
    LIQUIDITY_TOO_LOW: 'Liquidity too low (< 300k)',
    PRICE_OUT_OF_RANGE: 'Price out of range (₹20–₹2000)',
    VOLATILITY_TOO_LOW: 'Volatility too low (< 2%)',
    NOT_NEAR_HIGH: 'Not near day high (< 70% of range)',
    TRAP_GUARD: 'Trap guard (high gap, low volume)'
  };
  return labels[reason] || reason;
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
  
  // Auto-detect EOD date if not provided
  let refEodDate = eodDate;
  if (!refEodDate) {
    refEodDate = await findMostRecentEODDate(date);
    if (!refEodDate) {
      return {
        success: false,
        signals: [],
        diagnostics,
        message: `No EOD data found before ${date}. Please upload previous day's bhavcopy first.`
      };
    }
    console.log(`✅ [MomentumGap PREM] Auto-detected EOD date: ${refEodDate} for premarket date: ${date}`);
  }
  
  // Try to load cached EOD candidates first
  let eodCandidates = await loadEODCandidates(refEodDate, 'momentum_gap');
  
  // If no cached candidates, generate them (will cache automatically)
  if (!eodCandidates || eodCandidates.length === 0) {
    console.log(`⚠️ [MomentumGap PREM] No cached candidates found, generating from bhavcopy...`);
    const eodResult = await runMomentumGapEOD(date, refEodDate, params);
    if (!eodResult.success) {
      return eodResult;
    }
    eodCandidates = eodResult.signals;
  }
  
  if (!eodCandidates || eodCandidates.length === 0) {
    return {
      success: false,
      signals: [],
      diagnostics,
      message: `No EOD candidates found for reference date ${refEodDate}`
    };
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
  
  for (const candidate of eodCandidates) {
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
    
    // Premarket volume filter
    // Use absolute minimum (50000) or skip if preMVolume field is missing/0
    if (preMVolume > 0 && preMVolume < config.preMMinAbs) {
      diagnostics[REJECTION_REASONS.PREM_VOL_TOO_LOW_ABS]++;
      continue;
    }
    // If preMVolume is 0 or missing, skip volume filter (field might not be available)
    
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
  
  // Get top rejection reasons
  const rejectStats = Object.entries(diagnostics)
    .filter(([_, count]) => count > 0)
    .map(([reason, count]) => ({
      ruleId: reason,
      label: getRejectionLabel(reason),
      rejectedCount: count
    }))
    .sort((a, b) => b.rejectedCount - a.rejectedCount);
  
  // Get filters used for this mode
  const filtersUsed = [
    { label: 'Gap Range', value: `${config.gapMin}%–${config.gapMax}%` },
    { label: 'Premarket Volume', value: `>= ${(config.preMMinAbs / 1000).toFixed(0)}k` },
    { label: 'Score Min', value: config.preMScoreMin }
  ];
  
  return {
    success: true,
    signals: finalSignals,
    diagnostics,
    meta: {
      rejectStats,
      filtersUsed,
      modeDisplay: 'PREMARKET',
      dataUsed: { eodDate: refEodDate, preMDate: date }
    },
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
      meta: {
        ...eodResult.meta,
        modeDisplay: 'LIVE'
      },
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
  REJECTION_REASONS,
  RULES_TEXT
};

