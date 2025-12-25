/**
 * Signals Generation Module
 * 
 * WORKFLOW: Signals are generated server-side after CSV uploads; UI is read-only.
 * 
 * This module provides generateSignalsForDate() which:
 * 1. Checks for required datasets (bhav, premarket) for the given date
 * 2. Returns INSUFFICIENT_DATA status if required files are missing
 * 3. Generates signals using existing momentum_gap strategy logic
 * 4. Returns status: READY | NO_MATCH | INSUFFICIENT_DATA | ERROR
 * 5. Saves results to signals_store collection for read-only UI access
 */

const { 
  getDailyBhavcopyCollection, 
  getPreMarketDataCollection,
  getDailyIndicesCollection,
  getUploadedDataCollection,
  getSignalsStoreCollection
} = require('../mongodb');

/**
 * Get yesterday's date (skip weekends)
 */
function getYesterdayDate(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Get next trading day (tomorrow, skip weekends)
 */
function getNextTradingDay(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() + 1);
  // Skip weekends - if tomorrow is Saturday, go to Monday
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Get current mood from database (most recent)
 */
async function getCurrentMood() {
  try {
    const indicesCollection = await getDailyIndicesCollection();
    // Get most recent mood data
    const latestData = await indicesCollection
      .find({ mood: { $exists: true } })
      .sort({ date: -1, uploadedAt: -1 })
      .limit(1)
      .toArray();
    
    if (latestData.length > 0 && latestData[0].mood) {
      return latestData[0].mood;
    }
    
    // Fallback: try uploaded data collection
    const uploadedCollection = await getUploadedDataCollection('indices');
    const uploadedData = await uploadedCollection
      .find({ mood: { $exists: true } })
      .sort({ date: -1, uploadedAt: -1 })
      .limit(1)
      .toArray();
    
    if (uploadedData.length > 0 && uploadedData[0].mood) {
      return uploadedData[0].mood;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting current mood:', error);
    return null;
  }
}

/**
 * Select strategy based on mood
 * @param {Object} mood - Mood object with score property
 * @returns {string} Strategy name
 */
function selectStrategyFromMood(mood) {
  if (!mood || typeof mood.score !== 'number') {
    // Default to momentum_gap if no mood data
    return 'momentum_gap';
  }
  
  const score = mood.score;
  
  // Strategy selection based on mood score:
  // 0-30: Bearish -> Use momentum_gap (gap-up plays in bearish market)
  // 31-50: Slightly Bearish/Neutral -> Use momentum_gap (default)
  // 51-70: Slightly Bullish -> Use momentum_gap (gap-up plays work well)
  // 71-100: Bullish -> Use momentum_gap (strong momentum plays)
  
  // For now, we use momentum_gap for all moods, but this can be extended
  // to support other strategies like:
  // - 'reversal' for bearish markets
  // - 'breakout' for bullish markets
  // - 'momentum_gap' for all (current default)
  
  if (score <= 30) {
    // Very bearish - could use reversal strategy, but momentum_gap still works
    return 'momentum_gap';
  } else if (score <= 50) {
    // Neutral to slightly bearish
    return 'momentum_gap';
  } else if (score <= 70) {
    // Slightly bullish
    return 'momentum_gap';
  } else {
    // Very bullish
    return 'momentum_gap';
  }
}

/**
 * Simple Momentum Gap signal generator
 * Filters EQ series stocks, finds gap-up near high candidates
 * This is a copy of the function from signals.js to avoid circular dependencies
 */
async function generateSimpleMomentumGapSignals(date, strategy = 'momentum_gap') {
  // Implementation copied from signals.js - see that file for full details
  // This function generates signals and returns filterCounters for debugging
  try {
    const yesterdayDate = getYesterdayDate(date);
    console.log(`📊 Generating signals for ${date} with strategy: ${strategy}:`);
    console.log(`   - Premarket data: ${date} (today's pre-open)`);
    console.log(`   - Bhavcopy data: ${yesterdayDate} (yesterday's EOD)`);
    
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const premarketCollection = await getPreMarketDataCollection();

    // Get yesterday's bhavcopy data
    let bhavcopyData = [];
    try {
      bhavcopyData = await bhavcopyCollection
        .find({ 
          date: yesterdayDate,
          series: 'EQ'
        })
        .toArray();
      
      if (bhavcopyData.length === 0) {
        const uploadedBhavCollection = await getUploadedDataCollection('bhav');
        const uploadedBhavDocs = await uploadedBhavCollection
          .find({ date: yesterdayDate })
          .toArray();
        
        for (const doc of uploadedBhavDocs) {
          if (doc.indices && Array.isArray(doc.indices) && doc.indices.length > 0) {
            const eqStocks = doc.indices.filter(item => {
              return !item.series || item.series === 'EQ';
            });
            bhavcopyData = bhavcopyData.concat(eqStocks);
          }
        }
      }
    } catch (queryError) {
      console.error('Error querying bhavcopy data:', queryError);
      return {
        success: false,
        date: date,
        signals: [],
        signal_count: 0,
        message: `Error querying bhavcopy data for ${yesterdayDate}`
      };
    }

    if (bhavcopyData.length === 0) {
      return {
        success: true,
        date: date,
        signals: [],
        signal_count: 0,
        message: `No bhavcopy data found for ${yesterdayDate}. Please upload bhavcopy data.`
      };
    }

    // Get today's premarket data
    let premarketData = [];
    try {
      premarketData = await premarketCollection
        .find({ date: date })
        .toArray();
      
      if (premarketData.length === 0) {
        const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
        const uploadedPremarketDocs = await uploadedPremarketCollection
          .find({ date: date })
          .toArray();
        
        for (const doc of uploadedPremarketDocs) {
          if (doc.indices && Array.isArray(doc.indices)) {
            premarketData = premarketData.concat(doc.indices);
          }
        }
      }
    } catch (queryError) {
      console.error('Error querying premarket data:', queryError);
      premarketData = [];
    }
    
    if (premarketData.length === 0) {
      console.warn(`⚠️ No premarket data found for ${date}`);
    }

    // Create lookup maps
    const bhavcopyMap = new Map();
    bhavcopyData.forEach(item => {
      const symbol = item.symbol || item.SYMBOL || item.Symbol;
      if (symbol) {
        bhavcopyMap.set(symbol.toUpperCase(), item);
      }
    });

    const premarketMap = new Map();
    premarketData.forEach(item => {
      const symbol = item.symbol || item.SYMBOL || item.Symbol;
      if (symbol) {
        premarketMap.set(symbol.toUpperCase(), item);
      }
    });

    // Generate signals with filter counters
    const signals = [];
    const processedSymbols = new Set();
    const filterCounters = {
      totalPremarket: premarketData.length,
      totalBhavcopy: bhavcopyData.length,
      noSymbol: 0,
      duplicateSymbol: 0,
      noBhavcopyMatch: 0,
      notEqSeries: 0,
      invalidYesterdayClose: 0,
      invalidPremarketPrice: 0,
      gapTooSmall: 0,
      volumeTooLow: 0,
      scoreTooLow: 0,
      passed: 0
    };

    // Process stocks with premarket data
    for (const premarket of premarketData) {
      const symbol = (premarket.symbol || premarket.SYMBOL || premarket.Symbol || '').toUpperCase();
      if (!symbol) {
        filterCounters.noSymbol++;
        continue;
      }
      if (processedSymbols.has(symbol)) {
        filterCounters.duplicateSymbol++;
        continue;
      }
      
      const bhavcopy = bhavcopyMap.get(symbol);
      if (!bhavcopy) {
        filterCounters.noBhavcopyMatch++;
        continue;
      }
      
      if (bhavcopy.series && bhavcopy.series !== 'EQ') {
        filterCounters.notEqSeries++;
        continue;
      }

      const yesterdayClose = bhavcopy.close || bhavcopy.prevClose || bhavcopy.CLOSE || 
                            bhavcopy.PREV_CLOSE || bhavcopy.last_price || bhavcopy.LAST_PRICE || 0;
      if (yesterdayClose <= 0) {
        filterCounters.invalidYesterdayClose++;
        continue;
      }

      const premarketPrice = premarket.iep || premarket.pre_open_price || premarket.PRE_OPEN_PRICE || 
                            premarket.price || premarket.PRICE ||
                            premarket.last_price || premarket.LAST_PRICE ||
                            premarket.open || premarket.OPEN || 0;
      if (premarketPrice <= 0) {
        filterCounters.invalidPremarketPrice++;
        continue;
      }

      const gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100;

      if (gapPercent < 0.3) {
        filterCounters.gapTooSmall++;
        continue;
      }

      const yesterdayHigh = bhavcopy.high || yesterdayClose;
      let nearHigh = false;
      if (yesterdayHigh > 0) {
        const nearHighPercent = ((yesterdayHigh - premarketPrice) / yesterdayHigh) * 100;
        nearHigh = Math.abs(nearHighPercent) <= 2.0;
      }

      const volume = bhavcopy.volume || bhavcopy.VOLUME || 
                    bhavcopy.tottrdqty || bhavcopy.TOTTRDQTY || 
                    bhavcopy.traded_quantity || bhavcopy.TRADED_QUANTITY || 0;
      const minVolume = 100000;
      if (volume < minVolume) {
        filterCounters.volumeTooLow++;
        continue;
      }

      // Calculate score
      let gapScore = 0;
      if (gapPercent >= 0.5 && gapPercent <= 2.5) {
        const optimalGap = 1.5;
        const distance = Math.abs(gapPercent - optimalGap);
        gapScore = Math.max(0, 40 - (distance * 20));
      } else if (gapPercent > 2.5 && gapPercent <= 5.0) {
        gapScore = 30 - ((gapPercent - 2.5) * 4);
      }

      const nearHighScore = nearHigh ? 20 : 0;

      let volumeScore = 0;
      if (volume >= 1000000) volumeScore = 20;
      else if (volume >= 500000) volumeScore = 15;
      else if (volume >= 200000) volumeScore = 10;
      else volumeScore = 5;

      let deliveryScore = 0;
      const delivery = bhavcopy.delivery || 0;
      const deliveryPercent = bhavcopy.delivery_percent || 0;
      if (deliveryPercent > 50) deliveryScore = 20;
      else if (deliveryPercent > 30) deliveryScore = 15;
      else if (deliveryPercent > 20) deliveryScore = 10;

      const totalScore = gapScore + nearHighScore + volumeScore + deliveryScore;

      if (totalScore < 50) {
        filterCounters.scoreTooLow++;
        continue;
      }
      
      filterCounters.passed++;

      const entryPrice = premarketPrice;
      const atr = bhavcopy.atr20 || (yesterdayClose * 0.02);
      const stopLoss = entryPrice - (atr * 1.5);
      const targetPrice = entryPrice + (atr * 2.5);

      const reasons = [];
      if (gapPercent >= 0.5) reasons.push(`Gap-up ${gapPercent.toFixed(2)}%`);
      if (nearHigh) reasons.push('Near high');
      if (volume >= 500000) reasons.push('High volume');
      if (deliveryPercent > 30) reasons.push('Good delivery');

      const reason = reasons.join(', ') || 'Gap-up momentum';

      signals.push({
        symbol: symbol,
        direction: 'BUY',
        entry: parseFloat(entryPrice.toFixed(2)),
        target: parseFloat(targetPrice.toFixed(2)),
        sl: parseFloat(Math.max(0, stopLoss).toFixed(2)),
        score: Math.round(totalScore),
        reason: reason,
        entry_price: parseFloat(entryPrice.toFixed(2)),
        target_price: parseFloat(targetPrice.toFixed(2)),
        stop_loss: parseFloat(Math.max(0, stopLoss).toFixed(2)),
        side: 'BUY',
        confidence_score: parseFloat((totalScore / 100).toFixed(2)),
        gap_percent: parseFloat(gapPercent.toFixed(2)),
        near_high: nearHigh,
        volume: volume,
        delivery_percent: deliveryPercent
      });

      processedSymbols.add(symbol);
    }

    // Sort by score descending and take top 10
    signals.sort((a, b) => b.score - a.score);
    const topSignals = signals.slice(0, 10);

    // Find top reason for 0 signals
    let topReason = '';
    if (topSignals.length === 0) {
      const reasons = [
        { key: 'noBhavcopyMatch', label: 'No bhavcopy match' },
        { key: 'gapTooSmall', label: 'Gap too small' },
        { key: 'volumeTooLow', label: 'Volume too low' },
        { key: 'scoreTooLow', label: 'Score too low' },
        { key: 'invalidPremarketPrice', label: 'Invalid premarket price' },
        { key: 'invalidYesterdayClose', label: 'Invalid yesterday close' }
      ];
      const sortedReasons = reasons.sort((a, b) => filterCounters[b.key] - filterCounters[a.key]);
      topReason = sortedReasons[0] ? `${sortedReasons[0].label} (${filterCounters[sortedReasons[0].key]})` : 'Unknown';
    }

    return {
      success: true,
      date: date,
      signals: topSignals,
      signal_count: topSignals.length,
      message: topSignals.length > 0 
        ? `Generated ${topSignals.length} signals for ${date}`
        : `No signals generated for ${date} (no stocks met criteria)`,
      filterCounters: filterCounters,
      topReason: topReason
    };

  } catch (error) {
    console.error('Error generating signals:', error);
    return {
      success: false,
      date: date || new Date().toISOString().split('T')[0],
      signals: [],
      signal_count: 0,
      message: `Signal generation failed: ${error.message || 'Unknown error'}`,
      error: error.message
    };
  }
}

/**
 * Get yesterday's date (skip weekends)
 */
function getYesterdayDate(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Check if required datasets are available for a date
 * 
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} - { hasBhav: boolean, hasPremarket: boolean, missingFiles: string[] }
 */
async function checkDataAvailability(date) {
  const yesterdayDate = getYesterdayDate(date);
  const missingFiles = [];
  
  let hasBhav = false;
  let hasPremarket = false;

  try {
    // Check bhavcopy (yesterday's date)
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const bhavcopyCount = await bhavcopyCollection.countDocuments({ 
      date: yesterdayDate,
      series: 'EQ'
    });
    
    if (bhavcopyCount === 0) {
      // Check uploadedBhav as fallback
      const uploadedBhavCollection = await getUploadedDataCollection('bhav');
      const uploadedBhavCount = await uploadedBhavCollection.countDocuments({ date: yesterdayDate });
      hasBhav = uploadedBhavCount > 0;
    } else {
      hasBhav = true;
    }
    
    if (!hasBhav) {
      missingFiles.push(`bhavcopy for ${yesterdayDate}`);
    }
  } catch (error) {
    console.error('Error checking bhavcopy data:', error);
    missingFiles.push(`bhavcopy for ${yesterdayDate}`);
  }

  try {
    // Check premarket (today's date)
    const premarketCollection = await getPreMarketDataCollection();
    const premarketCount = await premarketCollection.countDocuments({ date });
    
    if (premarketCount === 0) {
      // Check uploadedPreMarket as fallback
      const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
      const uploadedPremarketCount = await uploadedPremarketCollection.countDocuments({ date });
      hasPremarket = uploadedPremarketCount > 0;
    } else {
      hasPremarket = true;
    }
    
    if (!hasPremarket) {
      missingFiles.push(`premarket for ${date}`);
    }
  } catch (error) {
    console.error('Error checking premarket data:', error);
    missingFiles.push(`premarket for ${date}`);
  }

  return {
    hasBhav,
    hasPremarket,
    missingFiles
  };
}

/**
 * Generate signals for a date and save to signals_store
 * 
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} strategy - Strategy name (default: 'momentum_gap')
 * @returns {Promise<Object>} - { status, date, strategy, signal_count, signals, message, missingFiles? }
 */
async function generateSignalsForDate(date, strategy = 'momentum_gap') {
  try {
    console.log(`📊 [generateSignalsForDate] Starting generation for ${date} with strategy ${strategy}`);
    
    // Check data availability
    const dataCheck = await checkDataAvailability(date);
    
    if (!dataCheck.hasBhav || !dataCheck.hasPremarket) {
      // Missing required data - save INSUFFICIENT_DATA status
      const signalsStoreCollection = await getSignalsStoreCollection();
      
      const insufficientDataDoc = {
        date,
        strategy,
        status: 'INSUFFICIENT_DATA',
        signal_count: 0,
        signals: [],
        missingFiles: dataCheck.missingFiles,
        message: `Missing required files: ${dataCheck.missingFiles.join(', ')}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Upsert (update if exists, insert if not)
      await signalsStoreCollection.updateOne(
        { date, strategy },
        { $set: insufficientDataDoc },
        { upsert: true }
      );
      
      console.log(`⚠️ [generateSignalsForDate] INSUFFICIENT_DATA for ${date}: ${dataCheck.missingFiles.join(', ')}`);
      
      return {
        status: 'INSUFFICIENT_DATA',
        date,
        strategy,
        signal_count: 0,
        signals: [],
        missingFiles: dataCheck.missingFiles,
        message: `Missing required files: ${dataCheck.missingFiles.join(', ')}`
      };
    }
    
    // Data is available - generate signals using existing logic
    console.log(`✅ [generateSignalsForDate] Data available, generating signals...`);
    const result = await generateSimpleMomentumGapSignals(date, strategy);
    
    // Determine status based on result
    let status;
    if (!result.success) {
      status = 'ERROR';
    } else if (result.signal_count === 0 || (result.signals && result.signals.length === 0)) {
      status = 'NO_MATCH';
    } else {
      status = 'READY';
    }
    
    // Prepare signals array (ensure it's an array)
    const signalsArray = Array.isArray(result.signals) ? result.signals : [];
    
    // Save to signals_store collection
    const signalsStoreCollection = await getSignalsStoreCollection();
    
    // Prepare debug info (filters used, counts before filters)
    const debugInfo = {
      filtersUsed: {
        minGapPercent: 0.3,
        minVolume: 100000,
        minScore: 50,
        series: 'EQ'
      },
      countsBeforeFilters: result.filterCounters || {},
      topReason: result.topReason || null
    };
    
    const storeDoc = {
      date,
      strategy,
      status,
      signal_count: signalsArray.length,
      signals: signalsArray,
      run_id: result.run_id || null,
      message: result.message || (status === 'READY' ? `Generated ${signalsArray.length} signals` : 'No signals generated'),
      filterCounters: result.filterCounters || null,
      topReason: result.topReason || null,
      debug: debugInfo, // Store debug info for optional retrieval
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Upsert (update if exists, insert if not)
    await signalsStoreCollection.updateOne(
      { date, strategy },
      { $set: storeDoc },
      { upsert: true }
    );
    
    console.log(`✅ [generateSignalsForDate] Saved to signals_store: status=${status}, count=${signalsArray.length}`);
    
    return {
      status,
      date,
      strategy,
      signal_count: signalsArray.length,
      signals: signalsArray,
      run_id: result.run_id || null,
      message: storeDoc.message,
      filterCounters: result.filterCounters,
      topReason: result.topReason
    };
    
  } catch (error) {
    console.error(`❌ [generateSignalsForDate] Error generating signals for ${date}:`, error);
    
    // Save ERROR status to signals_store
    try {
      const signalsStoreCollection = await getSignalsStoreCollection();
      await signalsStoreCollection.updateOne(
        { date, strategy },
        {
          $set: {
            date,
            strategy,
            status: 'ERROR',
            signal_count: 0,
            signals: [],
            message: `Signal generation failed: ${error.message || 'Unknown error'}`,
            error: error.message,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (saveError) {
      console.error('Failed to save ERROR status to signals_store:', saveError);
    }
    
    return {
      status: 'ERROR',
      date,
      strategy,
      signal_count: 0,
      signals: [],
      message: `Signal generation failed: ${error.message || 'Unknown error'}`,
      error: error.message
    };
  }
}

module.exports = {
  generateSignalsForDate,
  generateSimpleMomentumGapSignals,
  checkDataAvailability,
  getYesterdayDate,
  getNextTradingDay,
  getCurrentMood,
  selectStrategyFromMood
};

