const { 
  getDailyBhavcopyCollection, 
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection,
  getUploadedDataCollection,
  getDailyIndicesCollection
} = require('./lib/mongodb');
const { authMiddleware } = require('./lib/auth');

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

const handler = async (req, res) => {
  try {
    // Get operation from query params or body
    const operation = req.query.operation || req.body?.operation;
    
    // Validate operation
    const validOperations = ['generate', 'get', 'latest'];
    if (operation && !validOperations.includes(operation)) {
      return res.status(400).json({ 
        error: 'Invalid operation',
        validOperations,
        message: `Operation must be one of: ${validOperations.join(', ')}`
      });
    }

    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    
    if (req.method === 'POST' && operation === 'generate') {
      // Generate signals
      const date = req.query.date || req.body?.date || new Date().toISOString().split('T')[0];
      
      if (!mongoUri) {
        return res.status(200).json({
          success: false,
          date: date,
          run_id: null,
          signal_count: 0,
          signals: [],
          message: 'Signal generation requires MongoDB configuration.'
        });
      }

      const strategy = req.query.strategy || req.body?.strategy || 'momentum_gap';
      const result = await generateSimpleMomentumGapSignals(date, strategy);
      
      res.status(200).json({
        success: result.success !== false,
        date: result.date || date,
        run_id: result.run_id || null,
        signal_count: result.signal_count || (result.signals ? result.signals.length : 0),
        signals: result.signals || [],
        message: result.message || 'Signals generated successfully'
      });

    } else if (req.method === 'GET' && operation === 'get') {
      // Get signals (get-signals.js logic)
      const date = req.query.date || new Date().toISOString().split('T')[0];
      
      if (!mongoUri) {
        return res.status(200).json({
          date: date,
          run_id: null,
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: 'No signals available for this date yet. Signals will be generated when data is available.'
        });
      }

      // Try to get signals from database
      try {
        const signalCollection = await getSignalCollection();
        const signalRunCollection = await getSignalRunCollection();

        const signalRun = await signalRunCollection.findOne({ date: date });
        
        if (signalRun && signalRun.run_id) {
          const signals = await signalCollection
            .find({ run_id: signalRun.run_id })
            .sort({ score: -1 })
            .toArray();

          const transformedSignals = signals.map(signal => ({
            symbol: signal.symbol,
            score: signal.score,
            entry_price: signal.entry_price,
            target_price: signal.target_price,
            stop_loss: signal.stop_loss,
            side: signal.side || 'BUY',
            confidence_score: signal.confidence_score,
            feature_fields: signal.feature_fields,
            ai_explanation: signal.ai_explanation,
            reason: signal.reason
          }));

          return res.status(200).json({
            date: date,
            run_id: signalRun.run_id,
            signal_count: transformedSignals.length,
            signals: transformedSignals,
            hasSignals: transformedSignals.length > 0,
            message: transformedSignals.length > 0 
              ? `Found ${transformedSignals.length} signals for ${date}`
              : 'No signals found for this date'
          });
        }

        // No signals in DB - try to generate them
        const strategy = req.query.strategy || 'momentum_gap';
        console.log(`No signals found in DB for ${date}, attempting to generate with strategy: ${strategy}...`);
        
        try {
          const generatedResult = await generateSimpleMomentumGapSignals(date, strategy);
          
          if (generatedResult.signals && generatedResult.signals.length > 0) {
            const transformedSignals = generatedResult.signals.map(signal => ({
              symbol: signal.symbol,
              score: signal.score,
              entry_price: signal.entry || signal.entry_price,
              target_price: signal.target || signal.target_price,
              stop_loss: signal.sl || signal.stop_loss,
              side: signal.direction || signal.side || 'BUY',
              confidence_score: signal.confidence_score || (signal.score / 100),
              feature_fields: {
                gap_percent: signal.gap_percent,
                near_high: signal.near_high,
                volume: signal.volume,
                delivery_percent: signal.delivery_percent
              },
              reason: signal.reason
            }));

            return res.status(200).json({
              date: date,
              run_id: generatedResult.run_id || null,
              signal_count: transformedSignals.length,
              signals: transformedSignals,
              hasSignals: true,
              message: `Generated ${transformedSignals.length} signals for ${date}`
            });
          } else {
            return res.status(200).json({
              date: date,
              run_id: null,
              signal_count: 0,
              signals: [],
              hasSignals: false,
              message: generatedResult.message || 'No signals available for this date yet.'
            });
          }
        } catch (genError) {
          console.warn('Error generating signals in get-signals:', genError.message);
        }
      } catch (dbError) {
        console.warn('Error querying database for signals, returning empty:', dbError.message);
      }

      // No signals found - return empty response
      res.status(200).json({
        date: date,
        run_id: null,
        signal_count: 0,
        signals: [],
        hasSignals: false,
        message: 'No signals available for this date yet. Signals will be generated when data is available.'
      });

    } else if (req.method === 'GET' && operation === 'latest') {
      // Get latest signal date (get-latest-signal-date.js logic)
      const today = new Date().toISOString().split('T')[0];
      
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

        res.status(200).json({
          date: latestCompleteDate,
          hasSignals: false,
          latest_complete_date: latestCompleteDate,
          dates: dates,
          message: 'Latest dates retrieved from database'
        });
      } catch (dbError) {
        console.warn('Error querying database for latest dates, using today:', dbError.message);
        res.status(200).json({
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

    } else if (req.method === 'GET' && !operation) {
      // Default GET behavior - same as operation='get' for backward compatibility
      const date = req.query.date || new Date().toISOString().split('T')[0];
      
      if (!mongoUri) {
        return res.status(200).json({
          date: date,
          run_id: null,
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: 'No signals available for this date yet.'
        });
      }

      try {
        const signalCollection = await getSignalCollection();
        const signalRunCollection = await getSignalRunCollection();

        const signalRun = await signalRunCollection.findOne({ date: date });
        
        if (signalRun && signalRun.run_id) {
          const signals = await signalCollection
            .find({ run_id: signalRun.run_id })
            .sort({ score: -1 })
            .toArray();

          const transformedSignals = signals.map(signal => ({
            symbol: signal.symbol,
            score: signal.score,
            entry_price: signal.entry_price,
            target_price: signal.target_price,
            stop_loss: signal.stop_loss,
            side: signal.side || 'BUY',
            confidence_score: signal.confidence_score,
            feature_fields: signal.feature_fields,
            ai_explanation: signal.ai_explanation,
            reason: signal.reason
          }));

          return res.status(200).json({
            date: date,
            run_id: signalRun.run_id,
            signal_count: transformedSignals.length,
            signals: transformedSignals,
            hasSignals: transformedSignals.length > 0,
            message: transformedSignals.length > 0 
              ? `Found ${transformedSignals.length} signals for ${date}`
              : 'No signals found for this date'
          });
        }

        // Try to generate if not found
        const strategy = req.query.strategy || 'momentum_gap';
        const generatedResult = await generateSimpleMomentumGapSignals(date, strategy);
        
        if (generatedResult.signals && generatedResult.signals.length > 0) {
          const transformedSignals = generatedResult.signals.map(signal => ({
            symbol: signal.symbol,
            score: signal.score,
            entry_price: signal.entry || signal.entry_price,
            target_price: signal.target || signal.target_price,
            stop_loss: signal.sl || signal.stop_loss,
            side: signal.direction || signal.side || 'BUY',
            confidence_score: signal.confidence_score || (signal.score / 100),
            feature_fields: {
              gap_percent: signal.gap_percent,
              near_high: signal.near_high,
              volume: signal.volume,
              delivery_percent: signal.delivery_percent
            },
            reason: signal.reason
          }));

          return res.status(200).json({
            date: date,
            run_id: generatedResult.run_id || null,
            signal_count: transformedSignals.length,
            signals: transformedSignals,
            hasSignals: true,
            message: `Generated ${transformedSignals.length} signals for ${date}`
          });
        }

        res.status(200).json({
          date: date,
          run_id: null,
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: 'No signals available for this date yet.'
        });
      } catch (error) {
        console.error('Error in get-signals:', error);
        res.status(200).json({
          date: date,
          run_id: null,
          signal_count: 0,
          signals: [],
          hasSignals: false,
          message: 'Error retrieving signals',
          error: error.message
        });
      }

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

module.exports = authMiddleware({
  requireAuth: req => {
    // Require auth for POST (generate)
    const operation = req.query.operation || req.body?.operation;
    return req.method === 'POST' && operation === 'generate';
  },
  rateLimitType: req => {
    const operation = req.query.operation || req.body?.operation;
    if (req.method === 'POST' && operation === 'generate') return 'write';
    return 'public';
  }
})(handler);

// Export the generate function for reuse
module.exports.generateSimpleMomentumGapSignals = generateSimpleMomentumGapSignals;

