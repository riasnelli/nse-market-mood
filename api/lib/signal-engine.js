const { 
  getPreMarketDataCollection, 
  getDailyBhavcopyCollection,
  getSignalRunCollection,
  getSignalCollection,
  getDailyIndicesCollection
} = require('./mongodb');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper function to get yesterday's date
 */
function getYesterdayDate(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  // Skip weekends - go back to Friday if today is Monday
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Generate momentum gap signals
 * Uses: Today's premarket data + Yesterday's Bhavcopy and Indices data
 * 
 * @param {string} date - Date in YYYY-MM-DD format (today's date for premarket)
 * @returns {Promise<Object>} - Signal run result
 */
async function generateMomentumGapSignals(date) {
  try {
    // Calculate yesterday's date (for bhavcopy and indices)
    const yesterdayDate = getYesterdayDate(date);
    console.log(`Generating signals: Premarket date=${date}, Bhavcopy/Indices date=${yesterdayDate}`);

    // Get TODAY's pre-market data (required for gap calculation)
    const preMarketCollection = await getPreMarketDataCollection();
    const preMarketData = await preMarketCollection.find({ date }).toArray();
    
    if (preMarketData.length === 0) {
      console.warn(`No premarket data found for today (${date}), will use bhavcopy open as fallback`);
    }

    // Get YESTERDAY's bhavcopy data (required)
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const bhavcopyData = await bhavcopyCollection.find({ date: yesterdayDate }).toArray();

    if (bhavcopyData.length === 0) {
      throw new Error(`No bhavcopy data found for yesterday (${yesterdayDate})`);
    }

    // Create maps for quick lookup
    const bhavcopyMap = new Map();
    bhavcopyData.forEach(item => {
      bhavcopyMap.set(item.symbol, item);
    });

    const preMarketMap = new Map();
    preMarketData.forEach(item => {
      preMarketMap.set(item.symbol, item);
    });

    // Get regime code from YESTERDAY's daily_indices
    const indicesCollection = await getDailyIndicesCollection();
    const nifty50 = await indicesCollection.findOne({ 
      date: yesterdayDate, 
      symbol: { $regex: /NIFTY.*50/i } 
    });

    // Determine regime (default to RANGE if not found)
    let regimeCode = 'RANGE';
    // Regime would ideally come from mood calculation, but for now use a simple heuristic
    // This should be enhanced to use actual mood/regime data

    // Compute signals for all stocks with bhavcopy data
    // Match premarket symbols with bhavcopy symbols
    const signals = [];
    
    // Use premarket data as primary source (today's data)
    // Match with yesterday's bhavcopy data
    const processedSymbols = new Set();
    
    // First, process stocks that have both premarket (today) and bhavcopy (yesterday)
    for (const preMarket of preMarketData) {
      const symbol = preMarket.symbol;
      const bhavcopy = bhavcopyMap.get(symbol);
      
      if (!bhavcopy) {
        continue; // Skip if no bhavcopy data for this symbol
      }
      
      // Skip if missing required fields
      if (!bhavcopy.close || !bhavcopy.prev_close || bhavcopy.prev_close <= 0) {
        continue;
      }

      processedSymbols.add(symbol);
      
      // Compute features and score using today's premarket + yesterday's bhavcopy
      const signalData = computeSignalScore(preMarket, bhavcopy);

      // Only include signals above threshold (≥ 60)
      if (signalData.score >= 60) {
        signals.push({
          ...signalData,
          symbol,
          date: date, // Use today's date for the signal
          data_sources: {
            premarket_date: date,
            bhavcopy_date: yesterdayDate
          }
        });
      }
    }
    
    // Also process stocks that have bhavcopy but no premarket (use bhavcopy open as gap proxy)
    for (const bhavcopy of bhavcopyData) {
      const symbol = bhavcopy.symbol;
      
      // Skip if already processed
      if (processedSymbols.has(symbol)) {
        continue;
      }
      
      // Skip if missing required fields
      if (!bhavcopy.close || !bhavcopy.prev_close || bhavcopy.prev_close <= 0) {
        continue;
      }

      // No premarket data, use bhavcopy open as proxy
      const preMarket = null;
      
      // Compute features and score using bhavcopy open as gap proxy
      const signalData = computeSignalScore(preMarket, bhavcopy);

      // Only include signals above threshold (≥ 60)
      if (signalData.score >= 60) {
        signals.push({
          ...signalData,
          symbol,
          date: date, // Use today's date for the signal
          data_sources: {
            premarket_date: null, // No premarket data
            bhavcopy_date: yesterdayDate
          }
        });
      }
    }

    // Sort by score descending and take top 10
    signals.sort((a, b) => b.score - a.score);
    const topSignals = signals.slice(0, 10);

    if (topSignals.length === 0) {
      return {
        success: true,
        message: `No signals generated for ${date} (no stocks met criteria)`,
        run_id: null,
        signal_count: 0
      };
    }

    // Create signal run
    const runId = uuidv4();
    const signalRunCollection = await getSignalRunCollection();
    const signalCollection = await getSignalCollection();

    // Create signal_run document
    const signalRun = {
      run_id: runId,
      date, // Today's date (premarket date)
      bhavcopy_date: yesterdayDate, // Yesterday's date for bhavcopy/indices
      session: 'PREOPEN',
      regime_code: regimeCode,
      strategies_used: ['intraday_momentum_gap'],
      params_hash: hashStrategyParams(),
      created_at: new Date()
    };

    await signalRunCollection.insertOne(signalRun);

    // Create signal documents
    const signalDocs = topSignals.map(signal => ({
      run_id: runId,
      date,
      symbol: signal.symbol,
      strategy_name: 'intraday_momentum_gap',
      side: 'BUY', // All signals are BUY for momentum gap strategy
      score: signal.score,
      entry_price: signal.entry_price,
      stop_loss: signal.stop_loss,
      target_price: signal.target_price,
      confidence_score: signal.confidence_score,
      feature_fields: {
        gap_percent: signal.gap_percent,
        rs20: signal.rs20,
        vol_surge: signal.vol_surge,
        near_high_flag: signal.near_high_flag,
        liquidity_bucket: signal.liquidity_bucket
      },
      ai_explanation: null // Placeholder for AI explanation
    }));

    await signalCollection.insertMany(signalDocs);

    return {
      success: true,
      message: `Generated ${topSignals.length} signals for ${date}`,
      run_id: runId,
      signal_count: topSignals.length,
      signals: topSignals
    };
  } catch (error) {
    console.error('Error generating signals:', error);
    throw error;
  }
}

/**
 * Compute signal score for a stock based on pre-market and bhavcopy data
 * If pre-market data is not available, uses bhavcopy open vs prev_close as gap proxy
 */
function computeSignalScore(preMarket, bhavcopy) {
  // Calculate gap_percent: use pre-market if available, otherwise use bhavcopy open vs prev_close
  let gapPercent = 0;
  if (preMarket && preMarket.gap_percent !== undefined) {
    gapPercent = preMarket.gap_percent;
  } else if (bhavcopy.open && bhavcopy.prev_close && bhavcopy.prev_close > 0) {
    // Use bhavcopy open as proxy for pre-market price
    gapPercent = ((bhavcopy.open - bhavcopy.prev_close) / bhavcopy.prev_close) * 100;
  }

  const rs20 = bhavcopy.rs20 || 0;
  
  // Vol surge: use pre-market if available, otherwise calculate from bhavcopy volume vs avg_vol20
  let volSurge = 1.0;
  if (preMarket && preMarket.vol_surge !== undefined) {
    volSurge = preMarket.vol_surge;
  } else if (bhavcopy.volume && bhavcopy.avg_vol20 && bhavcopy.avg_vol20 > 0) {
    volSurge = bhavcopy.volume / bhavcopy.avg_vol20;
  }

  // Near high flag: use pre-market if available, otherwise check if open is near 52W high
  let nearHighFlag = false;
  if (preMarket && preMarket.near_high_flag !== undefined) {
    nearHighFlag = preMarket.near_high_flag;
  } else if (bhavcopy.open && bhavcopy.high_52w && bhavcopy.high_52w > 0) {
    nearHighFlag = bhavcopy.open >= (bhavcopy.high_52w * 0.98); // Within 2% of 52W high
  }

  // Liquidity bucket: use pre-market if available, otherwise estimate from volume
  let liquidityBucket = 'LOW';
  if (preMarket && preMarket.liquidity_bucket) {
    liquidityBucket = preMarket.liquidity_bucket;
  } else if (bhavcopy.volume) {
    if (bhavcopy.volume >= 1000000) liquidityBucket = 'HIGH';
    else if (bhavcopy.volume >= 500000) liquidityBucket = 'MEDIUM';
  }

  const atr20 = bhavcopy.atr20 || 0;
  const close = bhavcopy.close || 0;

  // Initialize scores
  let gapBandScore = 0;
  let rs20Score = 0;
  let volSurgeScore = 0;
  let nearHighBonus = 0;
  let liquidityScore = 0;
  let atrQualityScore = 0;

  // Gap band score (0-25)
  // Optimal gap between +0.3% and +3%
  if (gapPercent >= 0.3 && gapPercent <= 3.0) {
    // Best score at ~1.5% gap
    const optimalGap = 1.5;
    const distanceFromOptimal = Math.abs(gapPercent - optimalGap);
    gapBandScore = Math.max(0, 25 - (distanceFromOptimal * 10));
  } else if (gapPercent > 0 && gapPercent < 0.3) {
    // Small gap, partial score
    gapBandScore = (gapPercent / 0.3) * 10;
  }

  // RS20 score (0-20)
  // RS20 ≥ 4 gets full score, scales down
  if (rs20 >= 4) {
    rs20Score = 20;
  } else if (rs20 >= 2) {
    rs20Score = (rs20 / 4) * 20;
  }

  // Vol surge score (0-20)
  // vol_surge ≥ 1.5x gets full score
  if (volSurge >= 1.5) {
    volSurgeScore = Math.min(20, (volSurge / 2.0) * 20);
  } else if (volSurge >= 1.0) {
    volSurgeScore = ((volSurge - 1.0) / 0.5) * 10;
  }

  // Near high bonus (0 or 15)
  if (nearHighFlag) {
    nearHighBonus = 15;
  }

  // Liquidity score (0-10)
  if (liquidityBucket === 'HIGH') {
    liquidityScore = 10;
  } else if (liquidityBucket === 'MEDIUM') {
    liquidityScore = 5;
  }

  // ATR quality score (0-10)
  // Good ATR means reasonable volatility for stop placement
  if (close > 0 && atr20 > 0) {
    const atrPercent = (atr20 / close) * 100;
    // Optimal ATR between 2% and 5%
    if (atrPercent >= 2 && atrPercent <= 5) {
      atrQualityScore = 10;
    } else if (atrPercent > 0 && atrPercent < 2) {
      atrQualityScore = (atrPercent / 2) * 5;
    } else if (atrPercent > 5 && atrPercent < 10) {
      atrQualityScore = 10 - ((atrPercent - 5) / 5) * 5;
    }
  }

  // Total score (0-100)
  const totalScore = gapBandScore + rs20Score + volSurgeScore + nearHighBonus + liquidityScore + atrQualityScore;

  // Calculate entry, stop, and target prices
  // Use pre-market price if available, otherwise use bhavcopy open
  const entryPrice = preMarket?.pre_open_price || bhavcopy.open || close;
  const stopLoss = entryPrice - (atr20 * 1.5); // 1.5x ATR stop
  const targetPrice = entryPrice + (atr20 * 2.5); // 2.5x ATR target

  // Confidence score (0-1) based on how many criteria are met
  const criteriaMet = [
    gapPercent >= 0.3 && gapPercent <= 3.0,
    rs20 >= 4,
    volSurge >= 1.5,
    nearHighFlag,
    liquidityBucket !== 'LOW',
    atr20 > 0 && close > 0
  ].filter(Boolean).length;

  const confidenceScore = criteriaMet / 6;

  return {
    score: Math.round(totalScore),
    entry_price: parseFloat(entryPrice.toFixed(2)),
    stop_loss: parseFloat(Math.max(0, stopLoss).toFixed(2)),
    target_price: parseFloat(targetPrice.toFixed(2)),
    confidence_score: parseFloat(confidenceScore.toFixed(2)),
    gap_percent: parseFloat(gapPercent.toFixed(2)),
    rs20: parseFloat(rs20.toFixed(2)),
    vol_surge: parseFloat(volSurge.toFixed(2)),
    near_high_flag: nearHighFlag,
    liquidity_bucket: liquidityBucket
  };
}

/**
 * Hash strategy parameters for reproducibility tracking
 */
function hashStrategyParams() {
  // Simple hash of strategy parameters
  // In production, use a proper hashing function
  const params = {
    strategy: 'intraday_momentum_gap',
    gap_min: 0.3,
    gap_max: 3.0,
    rs20_min: 4,
    vol_surge_min: 1.5,
    score_threshold: 60,
    max_signals: 10
  };
  return JSON.stringify(params);
}

module.exports = {
  generateMomentumGapSignals,
  computeSignalScore
};

