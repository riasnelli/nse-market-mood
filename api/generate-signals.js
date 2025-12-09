const { 
  getDailyBhavcopyCollection, 
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection
} = require('./lib/mongodb');
const { v4: uuidv4 } = require('uuid');

/**
 * Get yesterday's date (skip weekends)
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
 * Simple Momentum Gap signal generator
 * Filters EQ series stocks, finds gap-up near high candidates
 */
async function generateSimpleMomentumGapSignals(date) {
  try {
    const yesterdayDate = getYesterdayDate(date);
    console.log(`📊 Generating signals: Premarket date=${date}, Bhavcopy date=${yesterdayDate}`);

    // Get collections
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const premarketCollection = await getPreMarketDataCollection();

    // Get yesterday's bhavcopy data (EQ series only)
    const bhavcopyData = await bhavcopyCollection
      .find({ 
        date: yesterdayDate,
        series: 'EQ' // Only EQ series stocks
      })
      .toArray();

    if (bhavcopyData.length === 0) {
      return {
        success: true,
        date: date,
        signals: [],
        message: `No bhavcopy data found for ${yesterdayDate}`
      };
    }

    // Get today's premarket data
    const premarketData = await premarketCollection
      .find({ date: date })
      .toArray();

    // Create lookup maps
    const bhavcopyMap = new Map();
    bhavcopyData.forEach(item => {
      bhavcopyMap.set(item.symbol, item);
    });

    const premarketMap = new Map();
    premarketData.forEach(item => {
      premarketMap.set(item.symbol, item);
    });

    // Generate signals
    const signals = [];
    const processedSymbols = new Set();

    // Process stocks with premarket data
    for (const premarket of premarketData) {
      const symbol = premarket.symbol;
      const bhavcopy = bhavcopyMap.get(symbol);

      if (!bhavcopy || processedSymbols.has(symbol)) continue;
      if (bhavcopy.series !== 'EQ') continue; // Double-check EQ series

      // Calculate gap %
      const yesterdayClose = bhavcopy.close || bhavcopy.prev_close || 0;
      if (yesterdayClose <= 0) continue;

      const premarketPrice = premarket.pre_open_price || premarket.price || 0;
      if (premarketPrice <= 0) continue;

      const gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100;

      // Filter: Gap must be positive (gap-up) and above threshold (0.3%)
      if (gapPercent < 0.3) continue;

      // Check if premarket price is near yesterday's high (momentum indicator)
      // This indicates the stock is continuing its upward momentum
      const yesterdayHigh = bhavcopy.high || yesterdayClose;
      const nearHighPercent = ((yesterdayHigh - premarketPrice) / yesterdayHigh) * 100;
      // Near high if premarket price is within 2% of yesterday's high (above or below)
      const nearHigh = Math.abs(nearHighPercent) <= 2.0;

      // Optional: Filter by volume (minimum volume threshold)
      const volume = bhavcopy.volume || 0;
      const minVolume = 100000; // Minimum 1 lakh shares
      if (volume < minVolume) continue;

      // Calculate score (0-100)
      // Gap score (0-40): Optimal gap between 0.5% and 2.5%
      let gapScore = 0;
      if (gapPercent >= 0.5 && gapPercent <= 2.5) {
        const optimalGap = 1.5;
        const distance = Math.abs(gapPercent - optimalGap);
        gapScore = Math.max(0, 40 - (distance * 20));
      } else if (gapPercent > 2.5 && gapPercent <= 5.0) {
        gapScore = 30 - ((gapPercent - 2.5) * 4); // Penalize large gaps
      }

      // Near high bonus (0-20)
      const nearHighScore = nearHigh ? 20 : 0;

      // Volume score (0-20): Higher volume = better
      let volumeScore = 0;
      if (volume >= 1000000) volumeScore = 20; // 10L+ shares
      else if (volume >= 500000) volumeScore = 15; // 5L+ shares
      else if (volume >= 200000) volumeScore = 10; // 2L+ shares
      else volumeScore = 5; // 1L+ shares (minimum)

      // Delivery score (0-20): If delivery data available
      let deliveryScore = 0;
      const delivery = bhavcopy.delivery || 0;
      const deliveryPercent = bhavcopy.delivery_percent || 0;
      if (deliveryPercent > 50) deliveryScore = 20;
      else if (deliveryPercent > 30) deliveryScore = 15;
      else if (deliveryPercent > 20) deliveryScore = 10;

      const totalScore = gapScore + nearHighScore + volumeScore + deliveryScore;

      // Only include signals with score >= 50
      if (totalScore < 50) continue;

      // Calculate entry, target, stop loss
      const entryPrice = premarketPrice;
      const atr = bhavcopy.atr20 || (yesterdayClose * 0.02); // Use 2% of price as ATR fallback
      const stopLoss = entryPrice - (atr * 1.5); // 1.5x ATR stop
      const targetPrice = entryPrice + (atr * 2.5); // 2.5x ATR target

      // Generate reason
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
        // Additional fields for compatibility
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

    if (topSignals.length === 0) {
      return {
        success: true,
        date: date,
        signals: [],
        message: `No signals generated for ${date} (no stocks met criteria)`
      };
    }

    // Save to database
    const runId = uuidv4();
    const signalRunCollection = await getSignalRunCollection();
    const signalCollection = await getSignalCollection();

    // Create signal run
    const signalRun = {
      run_id: runId,
      date: date,
      bhavcopy_date: yesterdayDate,
      strategy: 'momentum_gap',
      signal_count: topSignals.length,
      created_at: new Date()
    };

    await signalRunCollection.insertOne(signalRun);

    // Create signal documents
    const signalDocs = topSignals.map(signal => ({
      run_id: runId,
      date: date,
      symbol: signal.symbol,
      side: signal.side,
      score: signal.score,
      entry_price: signal.entry_price,
      stop_loss: signal.stop_loss,
      target_price: signal.target_price,
      confidence_score: signal.confidence_score,
      feature_fields: {
        gap_percent: signal.gap_percent,
        near_high: signal.near_high,
        volume: signal.volume,
        delivery_percent: signal.delivery_percent
      },
      reason: signal.reason
    }));

    await signalCollection.insertMany(signalDocs);

    return {
      success: true,
      date: date,
      run_id: runId,
      signal_count: topSignals.length,
      signals: topSignals,
      message: `Generated ${topSignals.length} signals for ${date}`
    };

  } catch (error) {
    console.error('Error generating signals:', error);
    throw error;
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    
    if (!mongoUri) {
      return res.status(200).json({
        success: true,
        date: date,
        signals: [],
        message: 'Signal generation requires MongoDB configuration.'
      });
    }

    // Generate signals
    const result = await generateSimpleMomentumGapSignals(date);
    
    res.status(200).json({
      success: result.success,
      date: result.date,
      run_id: result.run_id || null,
      signal_count: result.signal_count || result.signals.length,
      signals: result.signals || [],
      message: result.message || 'Signals generated successfully'
    });

  } catch (error) {
    console.error('Error in generate-signals:', error);
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.status(200).json({
      success: false,
      date: date,
      signals: [],
      message: 'Error generating signals',
      error: error.message
    });
  }
};

// Export the function for reuse
module.exports.generateSimpleMomentumGapSignals = generateSimpleMomentumGapSignals;

