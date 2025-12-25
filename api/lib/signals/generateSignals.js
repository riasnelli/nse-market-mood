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

const {
  nextTradingDay,
  prevTradingDay,
  resolveSignalDates,
  isTradingDay,
  isCalendarFallbackUsed
} = require('../tradingCalendar');

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
async function generateSimpleMomentumGapSignals(date, strategy = 'momentum_gap', refDate = null) {
  // Implementation copied from signals.js - see that file for full details
  // This function generates signals and returns filterCounters for debugging
  try {
    const yesterdayDate = refDate || prevTradingDay(date);
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
    
    const hasPremarket = premarketData.length > 0;
    if (!hasPremarket) {
      console.log(`⚠️ No premarket data found for ${date}. Generating signals based on yesterday's bhavcopy data only.`);
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
    if (hasPremarket) {
      premarketData.forEach(item => {
        const symbol = item.symbol || item.SYMBOL || item.Symbol;
        if (symbol) {
          premarketMap.set(symbol.toUpperCase(), item);
        }
      });
    }

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
      passed: 0,
      noPremarketData: !hasPremarket ? bhavcopyData.length : 0
    };

    // If no premarket data, generate signals based on bhavcopy only
    if (!hasPremarket) {
      // Process all bhavcopy stocks (no premarket filter)
      for (const bhavcopy of bhavcopyData) {
        const symbol = (bhavcopy.symbol || bhavcopy.SYMBOL || bhavcopy.Symbol || '').toUpperCase();
        if (!symbol) {
          filterCounters.noSymbol++;
          continue;
        }
        if (processedSymbols.has(symbol)) {
          filterCounters.duplicateSymbol++;
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

        const volume = bhavcopy.volume || bhavcopy.VOLUME || 
                      bhavcopy.tottrdqty || bhavcopy.TOTTRDQTY || 
                      bhavcopy.traded_quantity || bhavcopy.TRADED_QUANTITY || 0;
        const minVolume = 100000;
        if (volume < minVolume) {
          filterCounters.volumeTooLow++;
          continue;
        }

        // Without premarket, use yesterday's close as entry estimate
        // Look for stocks with strong momentum indicators from yesterday
        const yesterdayHigh = bhavcopy.high || yesterdayClose;
        const yesterdayLow = bhavcopy.low || yesterdayClose;
        const change = bhavcopy.change || bhavcopy.CHANGE || 0;
        const pChange = bhavcopy.pChange || bhavcopy.PCHANGE || bhavcopy.pctChange || 0;
        
        // Calculate momentum score based on yesterday's performance
        let momentumScore = 0;
        if (pChange > 0) {
          // Positive momentum
          if (pChange >= 2) momentumScore = 40;
          else if (pChange >= 1) momentumScore = 30;
          else if (pChange >= 0.5) momentumScore = 20;
          else momentumScore = 10;
        }

        const nearHighScore = (yesterdayHigh > 0 && Math.abs((yesterdayClose - yesterdayHigh) / yesterdayHigh) <= 0.02) ? 20 : 0;

        let volumeScore = 0;
        if (volume >= 1000000) volumeScore = 20;
        else if (volume >= 500000) volumeScore = 15;
        else if (volume >= 200000) volumeScore = 10;
        else volumeScore = 5;

        let deliveryScore = 0;
        const deliveryPercent = bhavcopy.delivery_percent || 0;
        if (deliveryPercent > 50) deliveryScore = 20;
        else if (deliveryPercent > 30) deliveryScore = 15;
        else if (deliveryPercent > 20) deliveryScore = 10;

        const totalScore = momentumScore + nearHighScore + volumeScore + deliveryScore;

        if (totalScore < 50) {
          filterCounters.scoreTooLow++;
          continue;
        }
        
        filterCounters.passed++;

        // Use yesterday's close as entry estimate (will be updated when premarket available)
        const entryPrice = yesterdayClose;
        const atr = bhavcopy.atr20 || (yesterdayClose * 0.02);
        const stopLoss = entryPrice - (atr * 1.5);
        const targetPrice = entryPrice + (atr * 2.5);

        const reasons = [];
        if (pChange > 0) reasons.push(`Momentum ${pChange.toFixed(2)}%`);
        if (nearHighScore > 0) reasons.push('Near high');
        if (volume >= 500000) reasons.push('High volume');
        if (deliveryPercent > 30) reasons.push('Good delivery');
        reasons.push('Based on yesterday data (premarket pending)');

        const reason = reasons.join(', ') || 'Momentum play';

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
          gap_percent: 0, // No gap data without premarket
          near_high: nearHighScore > 0,
          volume: volume,
          delivery_percent: deliveryPercent,
          pChange: parseFloat(pChange.toFixed(2)),
          has_premarket: false
        });

        processedSymbols.add(symbol);
      }
    } else {
      // Process stocks with premarket data (original logic)
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
        delivery_percent: deliveryPercent,
        has_premarket: true
      });

      processedSymbols.add(symbol);
    }
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
        { key: 'invalidYesterdayClose', label: 'Invalid yesterday close' },
        { key: 'noPremarketData', label: 'No premarket data' }
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
        ? hasPremarket 
          ? `Generated ${topSignals.length} signals for ${date}`
          : `Generated ${topSignals.length} preliminary signals for ${date} based on yesterday's data (premarket pending)`
        : `No signals generated for ${date} (no stocks met criteria)`,
      filterCounters: filterCounters,
      topReason: topReason,
      has_premarket: hasPremarket
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
 * Generate Breakout signals
 * Looks for stocks breaking out of consolidation patterns with high volume
 */
async function generateBreakoutSignals(date, strategy = 'breakout') {
  // Reuse momentum gap logic but with different filters
  // Breakout: Higher volume requirement, look for stocks near resistance breaking up
  const baseResult = await generateSimpleMomentumGapSignals(date, strategy);
  
  if (!baseResult.success) {
    return baseResult;
  }
  
  // Apply breakout-specific filters
  const breakoutSignals = baseResult.signals
    .filter(signal => {
      // Breakout requires higher volume (2x minimum)
      const volume = signal.volume || 0;
      return volume >= 200000; // Higher volume threshold for breakouts
    })
    .map(signal => ({
      ...signal,
      reason: signal.reason ? signal.reason.replace('Gap-up', 'Breakout') : 'Breakout pattern',
      strategy: 'breakout'
    }));
  
  return {
    ...baseResult,
    signals: breakoutSignals,
    signal_count: breakoutSignals.length,
    message: breakoutSignals.length > 0 
      ? `Generated ${breakoutSignals.length} breakout signals for ${date}`
      : `No breakout signals generated for ${date} (no stocks met criteria)`
  };
}

/**
 * Generate Mean Reversion signals
 * Finds oversold stocks that may revert to mean
 */
async function generateMeanReversionSignals(date, strategy = 'mean_reversion', refDate = null) {
  try {
    const yesterdayDate = refDate || prevTradingDay(date);
    console.log(`📊 Generating mean reversion signals for ${date}:`);
    
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const premarketCollection = await getPreMarketDataCollection();
    
    // Get data (same as momentum gap)
    let bhavcopyData = [];
    try {
      bhavcopyData = await bhavcopyCollection.find({ date: yesterdayDate, series: 'EQ' }).toArray();
      if (bhavcopyData.length === 0) {
        const uploadedBhavCollection = await getUploadedDataCollection('bhav');
        const uploadedBhavDocs = await uploadedBhavCollection.find({ date: yesterdayDate }).toArray();
        for (const doc of uploadedBhavDocs) {
          if (doc.indices && Array.isArray(doc.indices)) {
            const eqStocks = doc.indices.filter(item => !item.series || item.series === 'EQ');
            bhavcopyData = bhavcopyData.concat(eqStocks);
          }
        }
      }
    } catch (error) {
      return { success: false, date, signals: [], signal_count: 0, message: `Error querying bhavcopy data: ${error.message}` };
    }
    
    let premarketData = [];
    try {
      premarketData = await premarketCollection.find({ date }).toArray();
      if (premarketData.length === 0) {
        const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
        const uploadedPremarketDocs = await uploadedPremarketCollection.find({ date }).toArray();
        for (const doc of uploadedPremarketDocs) {
          if (doc.indices && Array.isArray(doc.indices)) {
            premarketData = premarketData.concat(doc.indices);
          }
        }
      }
    } catch (error) {
      premarketData = [];
    }
    
    const bhavcopyMap = new Map();
    bhavcopyData.forEach(item => {
      const symbol = (item.symbol || item.SYMBOL || item.Symbol || '').toUpperCase();
      if (symbol) bhavcopyMap.set(symbol, item);
    });
    
    const hasPremarket = premarketData.length > 0;
    const premarketMap = new Map();
    if (hasPremarket) {
      premarketData.forEach(item => {
        const symbol = (item.symbol || item.SYMBOL || item.Symbol || '').toUpperCase();
        if (symbol) premarketMap.set(symbol, item);
      });
    }
    
    const signals = [];
    
    if (hasPremarket) {
      // Mean reversion: Look for oversold stocks (negative gap, near low) with premarket data
      for (const [symbol, premarket] of premarketMap.entries()) {
        const bhavcopy = bhavcopyMap.get(symbol);
        if (!bhavcopy) continue;
        
        const yesterdayClose = bhavcopy.close || bhavcopy.prevClose || bhavcopy.CLOSE || bhavcopy.PREV_CLOSE || 0;
        const premarketPrice = premarket.iep || premarket.pre_open_price || premarket.PRE_OPEN_PRICE || premarket.price || 0;
        
        if (yesterdayClose <= 0 || premarketPrice <= 0) continue;
        
        const gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100;
        const volume = bhavcopy.volume || bhavcopy.VOLUME || bhavcopy.tottrdqty || 0;
        
        // Mean reversion: Look for negative gaps (oversold) near low
        if (gapPercent > -5 && gapPercent < 0) { // Down 0-5%
          const yesterdayLow = bhavcopy.low || yesterdayClose;
          const nearLow = yesterdayLow > 0 && Math.abs((premarketPrice - yesterdayLow) / yesterdayLow) <= 0.02;
          
          if (nearLow && volume >= 100000) {
            const entryPrice = premarketPrice;
            const atr = bhavcopy.atr20 || (yesterdayClose * 0.02);
            const stopLoss = entryPrice - (atr * 1.5);
            const targetPrice = yesterdayClose; // Target is mean reversion to yesterday's close
            
            const score = 50 + Math.abs(gapPercent) * 5; // More oversold = higher score
            
            signals.push({
              symbol,
              entry_price: parseFloat(entryPrice.toFixed(2)),
              target_price: parseFloat(targetPrice.toFixed(2)),
              stop_loss: parseFloat(Math.max(0, stopLoss).toFixed(2)),
              side: 'BUY',
              score: Math.round(score),
              reason: `Oversold ${gapPercent.toFixed(2)}%, mean reversion play`,
              confidence_score: parseFloat((score / 100).toFixed(2)),
              gap_percent: parseFloat(gapPercent.toFixed(2)),
              volume,
              has_premarket: true
            });
          }
        }
      }
    } else {
      // Without premarket: Look for oversold stocks from yesterday's data (negative change, near low)
      for (const [symbol, bhavcopy] of bhavcopyMap.entries()) {
        const yesterdayClose = bhavcopy.close || bhavcopy.prevClose || bhavcopy.CLOSE || bhavcopy.PREV_CLOSE || 0;
        const pChange = bhavcopy.pChange || bhavcopy.PCHANGE || bhavcopy.pctChange || 0;
        const volume = bhavcopy.volume || bhavcopy.VOLUME || bhavcopy.tottrdqty || 0;
        
        if (yesterdayClose <= 0 || volume < 100000) continue;
        
        // Mean reversion: Look for stocks that were down yesterday (oversold)
        if (pChange < 0 && pChange > -5) { // Down 0-5% yesterday
          const yesterdayLow = bhavcopy.low || yesterdayClose;
          const nearLow = yesterdayLow > 0 && Math.abs((yesterdayClose - yesterdayLow) / yesterdayLow) <= 0.02;
          
          if (nearLow) {
            const entryPrice = yesterdayClose;
            const atr = bhavcopy.atr20 || (yesterdayClose * 0.02);
            const stopLoss = entryPrice - (atr * 1.5);
            const targetPrice = yesterdayClose * 1.02; // Target 2% above entry (mean reversion)
            
            const score = 50 + Math.abs(pChange) * 5; // More oversold = higher score
            
            signals.push({
              symbol,
              entry_price: parseFloat(entryPrice.toFixed(2)),
              target_price: parseFloat(targetPrice.toFixed(2)),
              stop_loss: parseFloat(Math.max(0, stopLoss).toFixed(2)),
              side: 'BUY',
              score: Math.round(score),
              reason: `Oversold ${pChange.toFixed(2)}% yesterday, mean reversion play (premarket pending)`,
              confidence_score: parseFloat((score / 100).toFixed(2)),
              gap_percent: 0,
              volume,
              has_premarket: false
            });
          }
        }
      }
    }
    
    signals.sort((a, b) => b.score - a.score);
    const topSignals = signals.slice(0, 10);
    
    return {
      success: true,
      date,
      signals: topSignals,
      signal_count: topSignals.length,
      message: topSignals.length > 0 
        ? hasPremarket
          ? `Generated ${topSignals.length} mean reversion signals for ${date}`
          : `Generated ${topSignals.length} preliminary mean reversion signals for ${date} based on yesterday's data (premarket pending)`
        : `No mean reversion signals generated for ${date} (no oversold stocks found)`,
      has_premarket: hasPremarket
    };
  } catch (error) {
    return { success: false, date, signals: [], signal_count: 0, message: `Error: ${error.message}` };
  }
}

/**
 * Generate Defensive signals
 * Conservative approach - wait for better entry points or consider defensive positions
 */
async function generateDefensiveSignals(date, strategy = 'defensive', refDate = null) {
  // Defensive strategy: Very conservative filters, only high-quality setups
  const baseResult = await generateSimpleMomentumGapSignals(date, strategy, refDate);
  
  if (!baseResult.success) {
    return baseResult;
  }
  
  // Apply defensive filters: Higher score threshold, better quality
  const defensiveSignals = baseResult.signals
    .filter(signal => {
      // Defensive: Only high-quality signals with score >= 70
      return signal.score >= 70;
    })
    .map(signal => ({
      ...signal,
      reason: signal.reason ? `Defensive: ${signal.reason}` : 'Defensive position',
      strategy: 'defensive'
    }));
  
  return {
    ...baseResult,
    signals: defensiveSignals,
    signal_count: defensiveSignals.length,
    message: defensiveSignals.length > 0 
      ? `Generated ${defensiveSignals.length} defensive signals for ${date}`
      : `No defensive signals generated for ${date} (market conditions not suitable for conservative positions)`
  };
}

/**
 * Generate Volatility Play signals
 * Focus on high-beta stocks with strong momentum
 */
async function generateVolatilityPlaySignals(date, strategy = 'volatility_play', refDate = null) {
  // Volatility play: Look for high volatility stocks with strong momentum
  // If no premarket, use ATR/range% + liquidity instead of gap filters
  const baseResult = await generateSimpleMomentumGapSignals(date, strategy, refDate);
  
  if (!baseResult.success) {
    return baseResult;
  }
  
  // Apply volatility filters: Higher gap requirement, strong momentum
  const volatilitySignals = baseResult.signals
    .filter(signal => {
      // Volatility play: Higher gap requirement (>= 1%)
      const gapPercent = signal.gap_percent || 0;
      return gapPercent >= 1.0;
    })
    .map(signal => {
      // Adjust targets for volatility play (wider stops, higher targets)
      const entryPrice = signal.entry_price;
      const atr = entryPrice * 0.03; // Higher ATR for volatility
      return {
        ...signal,
        stop_loss: parseFloat(Math.max(0, entryPrice - (atr * 2)).toFixed(2)),
        target_price: parseFloat((entryPrice + (atr * 3)).toFixed(2)),
        reason: signal.reason ? `Volatility: ${signal.reason}` : 'High volatility momentum play',
        strategy: 'volatility_play'
      };
    });
  
  return {
    ...baseResult,
    signals: volatilitySignals,
    signal_count: volatilitySignals.length,
    message: volatilitySignals.length > 0 
      ? `Generated ${volatilitySignals.length} volatility play signals for ${date}`
      : `No volatility play signals generated for ${date} (insufficient volatility)`
  };
}

/**
 * Check if required datasets are available for a date
 * 
 * @param {string} targetDate - Target date in YYYY-MM-DD format
 * @param {string} mode - Mode: 'PLAYBOOK' | 'PREMARKET' | 'LIVE' (default: 'PLAYBOOK')
 * @returns {Promise<Object>} - Enhanced availability object
 */
async function checkDataAvailability(targetDate, mode = 'PLAYBOOK') {
  const { signalDate, refDate } = resolveSignalDates(targetDate);
  const missingFiles = [];
  const checkedCollections = [];
  
  const available = {
    bhav: false,
    premarket: false,
    ma: false,
    w52: false,
    index: false
  };
  
  const missing = {
    bhav: false,
    premarket: false,
    ma: false,
    w52: false,
    index: false
  };

  // Check bhavcopy for refDate (previous trading day)
  try {
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    checkedCollections.push('daily_bhavcopy');
    const bhavcopyCount = await bhavcopyCollection.countDocuments({ 
      date: refDate,
      series: 'EQ'
    });
    
    if (bhavcopyCount === 0) {
      const uploadedBhavCollection = await getUploadedDataCollection('bhav');
      checkedCollections.push('uploaded_data.bhav');
      const uploadedBhavCount = await uploadedBhavCollection.countDocuments({ date: refDate });
      available.bhav = uploadedBhavCount > 0;
    } else {
      available.bhav = true;
    }
    
    if (!available.bhav) {
      missing.bhav = true;
      missingFiles.push(`bhavcopy for ${refDate}`);
    }
  } catch (error) {
    console.error('Error checking bhavcopy data:', error);
    missing.bhav = true;
    missingFiles.push(`bhavcopy for ${refDate}`);
  }

  // Check premarket for signalDate
  try {
    const premarketCollection = await getPreMarketDataCollection();
    checkedCollections.push('premarket_data');
    const premarketCount = await premarketCollection.countDocuments({ date: signalDate });
    
    if (premarketCount === 0) {
      const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
      checkedCollections.push('uploaded_data.premarket');
      const uploadedPremarketCount = await uploadedPremarketCollection.countDocuments({ date: signalDate });
      available.premarket = uploadedPremarketCount > 0;
    } else {
      available.premarket = true;
    }
    
    if (!available.premarket) {
      missing.premarket = true;
      if (mode === 'PREMARKET' || mode === 'LIVE') {
        missingFiles.push(`premarket for ${signalDate}`);
      }
    }
  } catch (error) {
    console.error('Error checking premarket data:', error);
    missing.premarket = true;
    if (mode === 'PREMARKET' || mode === 'LIVE') {
      missingFiles.push(`premarket for ${signalDate}`);
    }
  }

  // Check other data types (optional)
  try {
    const maCollection = await getUploadedDataCollection('marketactivity');
    const maCount = await maCollection.countDocuments({ date: refDate });
    available.ma = maCount > 0;
    if (!available.ma) missing.ma = true;
  } catch (error) {
    missing.ma = true;
  }

  try {
    const w52Collection = await getUploadedDataCollection('52w');
    const w52Count = await w52Collection.countDocuments({ date: refDate });
    available.w52 = w52Count > 0;
    if (!available.w52) missing.w52 = true;
  } catch (error) {
    missing.w52 = true;
  }

  try {
    const indexCollection = await getDailyIndicesCollection();
    const indexCount = await indexCollection.countDocuments({ date: refDate });
    available.index = indexCount > 0;
    if (!available.index) missing.index = true;
  } catch (error) {
    missing.index = true;
  }

  const diagnostics = {
    calendarFallbackUsed: isCalendarFallbackUsed(signalDate),
    checkedCollections: [...new Set(checkedCollections)]
  };

  // Legacy compatibility fields
  const hasBhav = available.bhav;
  const hasPremarket = available.premarket;

  return {
    signalDate,
    refDate,
    available,
    missing,
    missingFiles,
    diagnostics,
    // Legacy fields for backward compatibility
    hasBhav,
    hasPremarket
  };
}

/**
 * Generate signals for a date and save to signals_store
 * 
 * @param {string} targetDate - Target date in YYYY-MM-DD format
 * @param {string} strategy - Strategy name (default: 'momentum_gap')
 * @param {string} mode - Mode: 'PLAYBOOK' | 'PREMARKET' | 'LIVE' (default: 'PLAYBOOK')
 * @returns {Promise<Object>} - { status, targetDate, signalDate, refDate, strategy, mode, signal_count, signals, message, missingFiles? }
 */
async function generateSignalsForDate(targetDate, strategy = 'momentum_gap', mode = 'PLAYBOOK') {
  try {
    console.log(`📊 [generateSignalsForDate] Starting generation for ${targetDate} with strategy ${strategy}, mode ${mode}`);
    
    // Resolve trading dates
    const { signalDate, refDate } = resolveSignalDates(targetDate);
    
    // Check data availability
    const dataCheck = await checkDataAvailability(targetDate, mode);
    
    // PLAYBOOK mode requires bhavcopy
    if (!dataCheck.available.bhav) {
      // Missing required data - save INSUFFICIENT_DATA status
      const signalsStoreCollection = await getSignalsStoreCollection();
      
      const insufficientDataDoc = {
        date: signalDate,
        refDate: refDate,
        strategy,
        mode,
        status: 'INSUFFICIENT_DATA',
        signal_count: 0,
        signals: [],
        missingFiles: dataCheck.missingFiles,
        message: `Cannot generate playbook: missing bhavcopy for ${refDate}.`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Upsert (update if exists, insert if not)
      await signalsStoreCollection.updateOne(
        { date: signalDate, strategy, mode },
        { $set: insufficientDataDoc },
        { upsert: true }
      );
      
      console.log(`⚠️ [generateSignalsForDate] INSUFFICIENT_DATA for ${signalDate}: refDate=${refDate}, missingFiles=${dataCheck.missingFiles.join(', ')}`);
      
      return {
        status: 'INSUFFICIENT_DATA',
        targetDate,
        signalDate,
        refDate,
        strategy,
        mode,
        signal_count: 0,
        signals: [],
        missingFiles: dataCheck.missingFiles,
        message: `Cannot generate playbook: missing bhavcopy for ${refDate}.`
      };
    }
    
    // Check if premarket is required for mode
    if ((mode === 'PREMARKET' || mode === 'LIVE') && !dataCheck.available.premarket) {
      return {
        status: 'INSUFFICIENT_DATA',
        targetDate,
        signalDate,
        refDate,
        strategy,
        mode,
        signal_count: 0,
        signals: [],
        missingFiles: dataCheck.missingFiles,
        message: `Premarket missing for ${signalDate} (${signalDate}). Playbook is available.`
      };
    }
    
    // Data is available - generate signals using strategy-specific logic
    console.log(`✅ [generateSignalsForDate] Data available, generating signals with strategy: ${strategy}, mode: ${mode}...`);
    
    let result;
    switch (strategy) {
      case 'momentum_gap':
        result = await generateSimpleMomentumGapSignals(signalDate, strategy, refDate);
        break;
      case 'breakout':
        result = await generateBreakoutSignals(signalDate, strategy, refDate);
        break;
      case 'mean_reversion':
        result = await generateMeanReversionSignals(signalDate, strategy, refDate);
        break;
      case 'defensive':
        result = await generateDefensiveSignals(signalDate, strategy, refDate);
        break;
      case 'volatility_play':
        result = await generateVolatilityPlaySignals(signalDate, strategy, refDate);
        break;
      default:
        console.warn(`⚠️ Unknown strategy: ${strategy}, falling back to momentum_gap`);
        result = await generateSimpleMomentumGapSignals(signalDate, 'momentum_gap', refDate);
    }
    
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
      date: signalDate,
      refDate: refDate,
      strategy,
      mode,
      status,
      signal_count: signalsArray.length,
      signals: signalsArray,
      run_id: result.run_id || null,
      message: result.message || (status === 'READY' ? `Generated ${signalsArray.length} signals` : 'No signals generated'),
      filterCounters: result.filterCounters || null,
      topReason: result.topReason || null,
      debug: debugInfo,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Upsert (update if exists, insert if not)
    await signalsStoreCollection.updateOne(
      { date: signalDate, strategy, mode },
      { $set: storeDoc },
      { upsert: true }
    );
    
    console.log(`✅ [generateSignalsForDate] Saved to signals_store: status=${status}, count=${signalsArray.length}`);
    
    return {
      status,
      targetDate,
      signalDate,
      refDate,
      strategy,
      mode,
      signal_count: signalsArray.length,
      signals: signalsArray,
      run_id: result.run_id || null,
      message: storeDoc.message,
      filterCounters: result.filterCounters,
      topReason: result.topReason,
      usedDates: { targetDate, signalDate, refDate }
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
  getCurrentMood,
  selectStrategyFromMood
};

