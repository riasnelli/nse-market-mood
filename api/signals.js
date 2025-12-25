const { 
  getDailyBhavcopyCollection, 
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection,
  getUploadedDataCollection,
  getDailyIndicesCollection,
  getSignalsStoreCollection
} = require('./lib/mongodb');
const { authMiddleware } = require('./lib/auth');
const { 
  generateSignalsForDate, 
  getCurrentMood, 
  selectStrategyFromMood 
} = require('./lib/signals/generateSignals');
const {
  nextTradingDay,
  prevTradingDay,
  resolveSignalDates,
  isTradingDay
} = require('./lib/tradingCalendar');

// Try to load uuid, but don't fail if it's not available
let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch (uuidError) {
  uuidv4 = null;
}

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
async function generateSimpleMomentumGapSignals(date, strategy = 'momentum_gap') {
  try {
    const yesterdayDate = getYesterdayDate(date);
    console.log(`📊 Generating signals for ${date} with strategy: ${strategy}:`);
    console.log(`   - Premarket data: ${date} (today's pre-open)`);
    console.log(`   - Bhavcopy data: ${yesterdayDate} (yesterday's EOD)`);
    console.log(`   - Indices data: ${yesterdayDate} (yesterday's EOD)`);
    
    // Get collections with error handling
    let bhavcopyCollection, premarketCollection;
    try {
      bhavcopyCollection = await getDailyBhavcopyCollection();
      premarketCollection = await getPreMarketDataCollection();
    } catch (dbError) {
      console.error('Error connecting to MongoDB collections:', dbError);
      return {
        success: false,
        date: date,
        signals: [],
        signal_count: 0,
        message: 'Database connection failed. Please check MongoDB configuration.'
      };
    }

    // Get yesterday's bhavcopy data from both daily_bhavcopy AND uploadedBhav collections
    let bhavcopyData = [];
    let bhavCountDaily = 0;
    let bhavCountUploaded = 0;
    
    try {
      // First, try daily_bhavcopy collection
      bhavcopyData = await bhavcopyCollection
        .find({ 
          date: yesterdayDate,
          series: 'EQ'
        })
        .toArray();
      
      bhavCountDaily = bhavcopyData.length;
      console.log(`📊 BHAVCOPY COUNT for ${yesterdayDate}: daily_bhavcopy = ${bhavCountDaily}`);
      
      // If no exact date match, try to find the most recent date before or equal to yesterday
      if (bhavcopyData.length === 0) {
        console.log(`No exact date match in daily_bhavcopy for ${yesterdayDate}, searching for closest date...`);
        const allBhavDaily = await bhavcopyCollection
          .find({ series: 'EQ' })
          .sort({ date: -1 })
          .limit(50)
          .toArray();
        
        const uniqueDates = [...new Set(allBhavDaily.map(d => d.date))].sort().reverse();
        console.log(`📅 Available dates in daily_bhavcopy:`, uniqueDates.slice(0, 10).join(', '));
        
        for (const dateStr of uniqueDates) {
          if (dateStr && dateStr <= yesterdayDate) {
            console.log(`✅ Found closest date in daily_bhavcopy: ${dateStr} (looking for ${yesterdayDate})`);
            bhavcopyData = await bhavcopyCollection
              .find({ date: dateStr, series: 'EQ' })
              .toArray();
            bhavCountDaily = bhavcopyData.length;
            break;
          }
        }
      }
      
      // If no data in daily_bhavcopy, check uploadedBhav collection
      if (bhavcopyData.length === 0) {
        console.log(`No data in daily_bhavcopy for ${yesterdayDate}, checking uploadedBhav...`);
        try {
          const uploadedBhavCollection = await getUploadedDataCollection('bhav');
          
          const allBhavDocs = await uploadedBhavCollection
            .find({})
            .sort({ date: -1 })
            .limit(20)
            .toArray();
          
          console.log(`📅 Available dates in uploadedBhav:`, allBhavDocs.map(d => d.date).join(', '));
          
          let uploadedBhavDocs = await uploadedBhavCollection
            .find({ date: yesterdayDate })
            .toArray();
          
          if (uploadedBhavDocs.length === 0) {
            let closestDoc = null;
            let closestDate = null;
            
            for (const doc of allBhavDocs) {
              if (doc.date && doc.date <= yesterdayDate) {
                if (!closestDate || doc.date > closestDate) {
                  closestDate = doc.date;
                  closestDoc = doc;
                }
              }
            }
            
            if (closestDoc) {
              uploadedBhavDocs = [closestDoc];
              console.log(`✅ Found closest date: ${closestDoc.date} (looking for ${yesterdayDate})`);
            }
          }
          
          for (const doc of uploadedBhavDocs) {
            if (doc.indices && Array.isArray(doc.indices) && doc.indices.length > 0) {
              const eqStocks = doc.indices.filter(item => {
                return !item.series || item.series === 'EQ';
              });
              
              bhavcopyData = bhavcopyData.concat(eqStocks);
              bhavCountUploaded += eqStocks.length;
            }
          }
        } catch (uploadedError) {
          console.error('Error querying uploadedBhav collection:', uploadedError);
        }
      }
      
      console.log(`📊 FINAL BHAVCOPY COUNT for ${yesterdayDate}: total = ${bhavcopyData.length}`);
      
      if (bhavcopyData.length === 0) {
        console.warn(`⚠️ No bhavcopy data found for ${yesterdayDate}`);
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
        const allPremarketDaily = await premarketCollection
          .find({})
          .sort({ date: -1 })
          .limit(50)
          .toArray();
        
        const uniqueDates = [...new Set(allPremarketDaily.map(d => d.date))].sort().reverse();
        
        for (const dateStr of uniqueDates) {
          if (dateStr && dateStr <= date) {
            premarketData = await premarketCollection
              .find({ date: dateStr })
              .toArray();
            break;
          }
        }
      }
      
      // If no data in premarket_data, check uploadedPreMarket collection
      if (premarketData.length === 0) {
        const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
        
        const allPremarketDocs = await uploadedPremarketCollection
          .find({})
          .sort({ date: -1 })
          .limit(20)
          .toArray();
        
        let uploadedPremarketDocs = await uploadedPremarketCollection
          .find({ date: date })
          .toArray();
        
        if (uploadedPremarketDocs.length === 0) {
          let closestDoc = null;
          let closestDate = null;
          
          for (const doc of allPremarketDocs) {
            if (doc.date && doc.date <= date) {
              if (!closestDate || doc.date > closestDate) {
                closestDate = doc.date;
                closestDoc = doc;
              }
            }
          }
          
          if (closestDoc) {
            uploadedPremarketDocs = [closestDoc];
          }
        }
        
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
      // Use normalized fields from parser
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

      // Use normalized fields: close, prevClose
      const yesterdayClose = bhavcopy.close || bhavcopy.prevClose || bhavcopy.CLOSE || 
                            bhavcopy.PREV_CLOSE || bhavcopy.last_price || bhavcopy.LAST_PRICE || 0;
      if (yesterdayClose <= 0) {
        filterCounters.invalidYesterdayClose++;
        continue;
      }

      // Use normalized fields: iep, pre_open_price, price
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

      // Use normalized fields: volume, ttl_trd_qnty
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
      
      return {
        success: true,
        date: date,
        signals: [],
        signal_count: 0,
        message: `No signals generated for ${date} (no stocks met criteria)`,
        filterCounters: filterCounters,
        topReason: topReason
      };
    }

    // Save to database
    let runId = null;
    try {
      if (uuidv4) {
        runId = uuidv4();
      } else {
        runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      const signalRunCollection = await getSignalRunCollection();
      const signalCollection = await getSignalCollection();

      const signalRun = {
        run_id: runId,
        date: date,
        bhavcopy_date: yesterdayDate,
        strategy: strategy || 'momentum_gap',
        signal_count: topSignals.length,
        filter_counters: filterCounters,
        created_at: new Date()
      };

      await signalRunCollection.insertOne(signalRun);

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
      console.log(`✅ Saved ${topSignals.length} signals to database with run_id: ${runId}`);
    } catch (dbWriteError) {
      console.warn('⚠️ Failed to save signals to database (continuing anyway):', dbWriteError.message);
    }

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
 * Verify admin authentication (APP_KEY header)
 */
function verifyAdminAuth(req) {
  const appKey = req.headers['x-app-key'];
  const validAppKey = process.env.APP_KEY;
  
  if (!validAppKey) {
    console.warn('⚠️ APP_KEY not configured in environment');
    return false;
  }
  
  return appKey === validAppKey;
}

const handler = async (req, res) => {
  const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
  
  try {
    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    
    // Clean REST API contract:
    // GET /api/signals?date=YYYY-MM-DD&strategy=momentum_gap - Get saved signals (READ-ONLY)
    // POST /api/signals with body {date, strategy} - Admin-only: Force regenerate signals
    
    if (req.method === 'GET') {
      // Support backward compatibility: ?operation=latest
      const operation = req.query.operation;
      if (operation === 'latest') {
        // Get latest signal date (get-latest-signal-date.js logic)
        const today = new Date().toISOString().split('T')[0];
        
        if (DEBUG) {
          console.log('[SIGNALS API] GET request - operation: latest');
        }
        
        if (!mongoUri) {
          return res.status(200).json({
            date: today,
            hasSignals: false,
            latest_complete_date: today,
            dates: {
              bhavcopy: today,
              indices: today,
              premarket: today
            },
            message: 'Using today as the latest available date (MongoDB not configured)'
          });
        }

        // Try to get latest dates from MongoDB collections
        try {
          const bhavcopyCollection = await getDailyBhavcopyCollection();
          const indicesCollection = await getDailyIndicesCollection();
          const premarketCollection = await getPreMarketDataCollection();

          const [latestBhavcopy] = await bhavcopyCollection
            .find({})
            .sort({ date: -1 })
            .limit(1)
            .toArray();
          
          const [latestIndices] = await indicesCollection
            .find({})
            .sort({ date: -1 })
            .limit(1)
            .toArray();
          
          const [latestPremarket] = await premarketCollection
            .find({})
            .sort({ date: -1 })
            .limit(1)
            .toArray();

          const dates = {
            bhavcopy: latestBhavcopy?.date || today,
            indices: latestIndices?.date || today,
            premarket: latestPremarket?.date || today
          };

          const allDates = [dates.bhavcopy, dates.indices, dates.premarket]
            .filter(Boolean)
            .sort()
            .reverse();
          
          const latestCompleteDate = allDates[0] || today;

          return res.status(200).json({
            date: latestCompleteDate,
            hasSignals: false,
            latest_complete_date: latestCompleteDate,
            dates: dates,
            message: 'Latest dates retrieved from database'
          });
        } catch (dbError) {
          console.warn('[SIGNALS API] Error querying database for latest dates, using today:', dbError.message);
          return res.status(200).json({
            date: today,
            hasSignals: false,
            latest_complete_date: today,
            dates: {
              bhavcopy: today,
              indices: today,
              premarket: today
            },
            message: 'Using today as the latest available date (database query failed)'
          });
        }
      }
      
      // Support backward compatibility: ?operation=get (from get-signals.js)
      if (operation === 'get') {
        // Legacy get-signals.js endpoint - redirect to main GET handler below
        // This maintains backward compatibility
      }
      
      // GET /api/signals?date=YYYY-MM-DD&strategy=momentum_gap - Get signals for a date (READ-ONLY)
      let targetDate = req.query.date || new Date().toISOString().split('T')[0];
      let strategy = req.query.strategy;
      const mode = req.query.mode || 'PLAYBOOK';
      const includeDebug = req.query.debug === '1' || process.env.NODE_ENV !== 'production';
      
      // Resolve trading dates from targetDate
      const { signalDate, refDate } = resolveSignalDates(targetDate);
      
      // If no strategy specified, get mood-based strategy
      if (!strategy) {
        try {
          const mood = await getCurrentMood();
          strategy = selectStrategyFromMood(mood);
          if (DEBUG) {
            console.log(`[SIGNALS API] Selected strategy based on mood: ${strategy} (mood score: ${mood?.score || 'N/A'})`);
          }
        } catch (error) {
          console.warn('[SIGNALS API] Error getting mood, using default strategy:', error.message);
          strategy = 'momentum_gap';
        }
      }
      
      // Check if market is closed on signalDate
      if (!isTradingDay(signalDate)) {
        const adjustedSignalDate = nextTradingDay(signalDate);
        const adjustedRefDate = prevTradingDay(adjustedSignalDate);
        console.log(`[SIGNALS API] Market closed on ${signalDate}, using ${adjustedSignalDate}`);
        return res.status(200).json({
          targetDate,
          signalDate: adjustedSignalDate,
          refDate: adjustedRefDate,
          strategy,
          mode,
          status: 'MARKET_CLOSED',
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: `Market closed on ${signalDate}. Signals available for ${adjustedSignalDate}.`,
          usedDates: { targetDate, signalDate: adjustedSignalDate, refDate: adjustedRefDate }
        });
      }
      
      if (DEBUG) {
        console.log(`[SIGNALS API] GET request - targetDate: ${targetDate}, signalDate: ${signalDate}, refDate: ${refDate}, strategy: ${strategy}, mode: ${mode}`);
      }
      
      if (!mongoUri) {
        if (DEBUG) console.log('[SIGNALS API] MongoDB not configured, returning NO_DATA status');
        return res.status(200).json({
          targetDate,
          signalDate,
          refDate,
          strategy,
          mode,
          status: 'NO_DATA',
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: 'MongoDB not configured. Signals cannot be generated.',
          usedDates: { targetDate, signalDate, refDate }
        });
      }

      try {
        // Read from signals_store collection (new unified store)
        const signalsStoreCollection = await getSignalsStoreCollection();
        const storedDoc = await signalsStoreCollection.findOne({ date: signalDate, strategy, mode });
        
        if (storedDoc) {
          // Return stored document with status
          const transformedSignals = Array.isArray(storedDoc.signals) ? storedDoc.signals.map(signal => ({
            symbol: signal.symbol,
            score: signal.score,
            entry_price: signal.entry_price,
            target_price: signal.target_price,
            stop_loss: signal.stop_loss,
            side: signal.side || 'BUY',
            confidence_score: signal.confidence_score,
            feature_fields: signal.feature_fields,
            reason: signal.reason
          })) : [];

          if (DEBUG) {
            console.log(`[SIGNALS API] Found stored signals: status=${storedDoc.status}, count=${transformedSignals.length}`);
          }

          const response = {
            targetDate,
            signalDate: storedDoc.date || signalDate,
            refDate: storedDoc.refDate || refDate,
            strategy: storedDoc.strategy,
            mode: storedDoc.mode || mode,
            status: storedDoc.status, // READY | NO_MATCH | INSUFFICIENT_DATA | ERROR
            signal_count: storedDoc.signal_count || 0,
            signals: transformedSignals,
            hasSignals: storedDoc.status === 'READY' && transformedSignals.length > 0,
            message: storedDoc.message || 'Signals retrieved',
            missingFiles: storedDoc.missingFiles || null,
            run_id: storedDoc.run_id || null,
            usedDates: { targetDate, signalDate: storedDoc.date || signalDate, refDate: storedDoc.refDate || refDate }
          };
          
          // Include debug info if requested
          if (includeDebug && storedDoc.debug) {
            response.debug = storedDoc.debug;
          }
          
          return res.status(200).json(response);
        }

        // No signals found in store - try to auto-generate if data is available
        if (DEBUG) console.log(`[SIGNALS API] No signals found in signals_store for ${signalDate} (${strategy}, ${mode})`);
        
        // Always try to auto-generate signals if data is available
        console.log(`[SIGNALS API] Attempting to auto-generate signals for ${signalDate} with strategy: ${strategy}, mode: ${mode}`);
        try {
          const result = await generateSignalsForDate(targetDate, strategy, mode);
          
          if (result.status === 'READY' || result.status === 'NO_MATCH') {
            // Signals generated successfully, return them
            const transformedSignals = Array.isArray(result.signals) ? result.signals.map(signal => ({
              symbol: signal.symbol,
              score: signal.score,
              entry_price: signal.entry_price,
              target_price: signal.target_price,
              stop_loss: signal.stop_loss,
              side: signal.side || 'BUY',
              confidence_score: signal.confidence_score,
              feature_fields: signal.feature_fields,
              reason: signal.reason
            })) : [];
            
            return res.status(200).json({
              targetDate: result.targetDate || targetDate,
              signalDate: result.signalDate || signalDate,
              refDate: result.refDate || refDate,
              strategy: result.strategy,
              mode: result.mode || mode,
              status: result.status,
              signal_count: result.signal_count || 0,
              signals: transformedSignals,
              hasSignals: result.status === 'READY' && transformedSignals.length > 0,
              message: result.message || 'Signals generated automatically',
              missingFiles: result.missingFiles || null,
              usedDates: result.usedDates || { targetDate, signalDate, refDate }
            });
          } else if (result.status === 'INSUFFICIENT_DATA') {
            // Data not available - return INSUFFICIENT_DATA status
            return res.status(200).json({
              targetDate: result.targetDate || targetDate,
              signalDate: result.signalDate || signalDate,
              refDate: result.refDate || refDate,
              strategy: result.strategy || strategy,
              mode: result.mode || mode,
              status: 'INSUFFICIENT_DATA',
              signal_count: 0,
              signals: [],
              hasSignals: false,
              message: result.message || 'Required CSV data not available for this date.',
              missingFiles: result.missingFiles || null,
              usedDates: result.usedDates || { targetDate, signalDate, refDate }
            });
          } else {
            // Generation failed (ERROR, etc.)
            return res.status(200).json({
              targetDate: result.targetDate || targetDate,
              signalDate: result.signalDate || signalDate,
              refDate: result.refDate || refDate,
              strategy: result.strategy || strategy,
              mode: result.mode || mode,
              status: result.status || 'ERROR',
              signal_count: 0,
              signals: [],
              hasSignals: false,
              message: result.message || 'Error generating signals. Please check logs.',
              missingFiles: result.missingFiles || null,
              usedDates: result.usedDates || { targetDate, signalDate, refDate }
            });
          }
        } catch (genError) {
          console.error('[SIGNALS API] Error auto-generating signals:', genError);
          // Fall through to return NO_DATA
        }
        
        // Return NO_DATA status if signals couldn't be generated
        return res.status(200).json({
          date: date,
          strategy: strategy,
          status: 'NO_DATA',
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: 'No signals available for this date yet. Please upload required CSV files (bhavcopy and premarket).'
        });
      } catch (error) {
        console.error('[SIGNALS API] Error retrieving signals:', error);
        return res.status(200).json({
          date: date,
          strategy: strategy,
          status: 'ERROR',
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: 'Error retrieving signals',
          error: error.message
        });
      }
      
    } else if (req.method === 'POST') {
      // POST /api/signals - Admin-only: Force regenerate signals
      // Requires x-app-key header matching APP_KEY environment variable
      
      if (!verifyAdminAuth(req)) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Admin authentication required. Provide x-app-key header matching APP_KEY.'
        });
      }
      
      const date = req.body?.date || req.query.date || new Date().toISOString().split('T')[0];
      const strategy = req.body?.strategy || req.query.strategy || 'momentum_gap';
      
      if (DEBUG) {
        console.log(`[SIGNALS API] POST request (admin) - date: ${date}, strategy: ${strategy}`);
      }
      
      if (!mongoUri) {
        if (DEBUG) console.log('[SIGNALS API] MongoDB not configured');
        return res.status(200).json({
          status: 'ERROR',
          date: date,
          strategy: strategy,
          signal_count: 0,
          signals: [],
          message: 'Signal generation requires MongoDB configuration.'
        });
      }

      // Generate signals using the new module
      const result = await generateSignalsForDate(date, strategy);
      
      if (DEBUG) {
        console.log(`[SIGNALS API] Generated signals: status=${result.status}, count=${result.signal_count || 0}`);
      }
      
      res.status(200).json({
        status: result.status,
        date: result.date || date,
        strategy: result.strategy || strategy,
        signal_count: result.signal_count || 0,
        signals: result.signals || [],
        hasSignals: result.status === 'READY' && (result.signals && result.signals.length > 0),
        message: result.message || 'Signals generated',
        missingFiles: result.missingFiles || null,
        run_id: result.run_id || null
      });

    } else {
      // Method not allowed
      return res.status(405).json({ 
        error: 'Method not allowed',
        message: `Method ${req.method} is not supported for this endpoint`,
        allowed: ['GET', 'POST']
      });
    }
  } catch (error) {
    console.error('❌ Error in signals endpoint:', error);
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      date: date
    });
  }
};

// Wrap handler with auth middleware
// GET requests are public (read-only)
// POST requests require admin auth (handled by verifyAdminAuth in handler)
const wrappedHandler = authMiddleware({
  requireAuth: req => {
    // GET requests are public (read-only signals page)
    if (req.method === 'GET') {
      return false;
    }
    // POST requests require admin auth (handled separately in handler via verifyAdminAuth)
    // We still run through auth middleware for rate limiting, but admin check is in handler
    return false; // Admin check happens in handler, not here
  },
  rateLimitType: req => {
    // POST requests are admin write operations
    if (req.method === 'POST') return 'write';
    return 'public';
  }
})(handler);

// Export the wrapped handler and generate function
const signalsModule = wrappedHandler;
signalsModule.generateSimpleMomentumGapSignals = generateSimpleMomentumGapSignals;
module.exports = signalsModule;

