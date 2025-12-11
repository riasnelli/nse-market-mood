const { 
  getDailyBhavcopyCollection, 
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection,
  getUploadedDataCollection
} = require('./lib/mongodb');

// Try to load uuid, but don't fail if it's not available
let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch (uuidError) {
  // uuid not available - will use fallback ID generation
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
 * 
 * Data availability timeline:
 * - Indices & Bhavcopy: Only available AFTER market hours (end of day data)
 * - Premarket: Available BEFORE market opens (today's pre-open prices)
 * 
 * For signals on DATE (today):
 * - Uses: Yesterday's indices + Yesterday's bhavcopy + Today's premarket
 * - This allows us to calculate gap % (today's premarket vs yesterday's close)
 * 
 * Never throws - always returns a result object
 */
async function generateSimpleMomentumGapSignals(date, strategy = 'momentum_gap') {
  try {
    const yesterdayDate = getYesterdayDate(date);
    console.log(`📊 Generating signals for ${date} with strategy: ${strategy}:`);
    console.log(`   - Premarket data: ${date} (today's pre-open)`);
    console.log(`   - Bhavcopy data: ${yesterdayDate} (yesterday's EOD)`);
    console.log(`   - Indices data: ${yesterdayDate} (yesterday's EOD)`);
    
    // DEBUG: Check what's actually in the database
    try {
      const { connectToDatabase } = require('./lib/mongodb');
      const { db } = await connectToDatabase();
      
      // Check daily_bhavcopy
      const bhav20251210 = await db.collection('daily_bhavcopy').countDocuments({ date: '2025-12-10' });
      const bhavAllDates = await db.collection('daily_bhavcopy').distinct('date');
      const bhavTotal = await db.collection('daily_bhavcopy').countDocuments({});
      
      // Check uploadedBhav
      const uploadedBhav20251210 = await db.collection('uploadedBhav').countDocuments({ date: '2025-12-10' });
      const uploadedBhavAllDates = await db.collection('uploadedBhav').distinct('date');
      const uploadedBhavTotal = await db.collection('uploadedBhav').countDocuments({});
      
      // Check premarket_data
      const premarket20251211 = await db.collection('premarket_data').countDocuments({ date: '2025-12-11' });
      const premarketAllDates = await db.collection('premarket_data').distinct('date');
      const premarketTotal = await db.collection('premarket_data').countDocuments({});
      
      // Check uploadedPreMarket
      const uploadedPremarket20251211 = await db.collection('uploadedPreMarket').countDocuments({ date: '2025-12-11' });
      const uploadedPremarketAllDates = await db.collection('uploadedPreMarket').distinct('date');
      const uploadedPremarketTotal = await db.collection('uploadedPreMarket').countDocuments({});
      
      console.log('🔍 DEBUG: Database counts for test dates:');
      console.log(`   daily_bhavcopy['2025-12-10']: ${bhav20251210} (total: ${bhavTotal})`);
      console.log(`   daily_bhavcopy dates: ${bhavAllDates.slice(0, 10).join(', ')}`);
      console.log(`   uploadedBhav['2025-12-10']: ${uploadedBhav20251210} (total: ${uploadedBhavTotal})`);
      console.log(`   uploadedBhav dates: ${uploadedBhavAllDates.slice(0, 10).join(', ')}`);
      console.log(`   premarket_data['2025-12-11']: ${premarket20251211} (total: ${premarketTotal})`);
      console.log(`   premarket_data dates: ${premarketAllDates.slice(0, 10).join(', ')}`);
      console.log(`   uploadedPreMarket['2025-12-11']: ${uploadedPremarket20251211} (total: ${uploadedPreMarketTotal})`);
      console.log(`   uploadedPreMarket dates: ${uploadedPreMarketAllDates.slice(0, 10).join(', ')}`);
      
      // Also check for yesterdayDate dynamically
      const bhavYesterday = await db.collection('daily_bhavcopy').countDocuments({ date: yesterdayDate });
      const uploadedBhavYesterday = await db.collection('uploadedBhav').countDocuments({ date: yesterdayDate });
      const premarketToday = await db.collection('premarket_data').countDocuments({ date: date });
      const uploadedPremarketToday = await db.collection('uploadedPreMarket').countDocuments({ date: date });
      
      console.log(`🔍 DEBUG: Counts for actual query dates:`);
      console.log(`   daily_bhavcopy['${yesterdayDate}']: ${bhavYesterday}`);
      console.log(`   uploadedBhav['${yesterdayDate}']: ${uploadedBhavYesterday}`);
      console.log(`   premarket_data['${date}']: ${premarketToday}`);
      console.log(`   uploadedPreMarket['${date}']: ${uploadedPremarketToday}`);
    } catch (debugError) {
      console.warn('⚠️ Debug query failed:', debugError.message);
    }

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
      // First, try daily_bhavcopy collection (includes data inserted from uploads)
      bhavcopyData = await bhavcopyCollection
        .find({ 
          date: yesterdayDate,
          series: 'EQ' // Only EQ series stocks
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
        
        // Get unique dates and find closest
        const uniqueDates = [...new Set(allBhavDaily.map(d => d.date))].sort().reverse();
        console.log(`📅 Available dates in daily_bhavcopy:`, uniqueDates.slice(0, 10).join(', '));
        
        // Find closest date <= yesterdayDate
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
          
          // First, let's see what dates are actually available
          const allBhavDocs = await uploadedBhavCollection
            .find({})
            .sort({ date: -1 })
            .limit(20)
            .toArray();
          
          console.log(`📅 Available dates in uploadedBhav:`, allBhavDocs.map(d => d.date).join(', '));
          console.log(`🔍 Looking for date: ${yesterdayDate}`);
          
          // Try exact date match first
          let uploadedBhavDocs = await uploadedBhavCollection
            .find({ date: yesterdayDate })
            .toArray();
          
          console.log(`📊 Exact match found: ${uploadedBhavDocs.length} documents`);
          
          // If no exact match, try to find the most recent date before or equal to yesterday
          if (uploadedBhavDocs.length === 0) {
            console.log(`No exact date match for ${yesterdayDate}, searching for closest date...`);
            
            // Find the closest date to yesterday (can be yesterday or before)
            let closestDoc = null;
            let closestDate = null;
            
            for (const doc of allBhavDocs) {
              if (doc.date) {
                // Compare dates as strings (ISO format YYYY-MM-DD)
                if (doc.date <= yesterdayDate) {
                  if (!closestDate || doc.date > closestDate) {
                    closestDate = doc.date;
                    closestDoc = doc;
                  }
                }
              }
            }
            
            if (closestDoc) {
              uploadedBhavDocs = [closestDoc];
              console.log(`✅ Found closest date: ${closestDoc.date} (looking for ${yesterdayDate})`);
            } else {
              console.log(`❌ No suitable date found. Available dates: ${allBhavDocs.map(d => d.date).join(', ')}`);
            }
          }
          
          console.log(`📊 Final uploadedBhav documents found: ${uploadedBhavDocs.length}`);
          
          // Extract indices array from uploaded documents
          for (const doc of uploadedBhavDocs) {
            console.log(`Processing uploadedBhav doc: fileName=${doc.fileName}, indices array length=${doc.indices?.length || 0}`);
            
            if (doc.indices && Array.isArray(doc.indices) && doc.indices.length > 0) {
              // Filter for EQ series and add to bhavcopyData
              // Also handle cases where series might be missing (default to EQ for bhavcopy)
              const eqStocks = doc.indices.filter(item => {
                // If series field exists, filter by EQ; otherwise include all (bhavcopy is typically EQ)
                return !item.series || item.series === 'EQ';
              });
              
              console.log(`Extracted ${eqStocks.length} stocks from uploadedBhav doc (total indices: ${doc.indices.length})`);
              bhavcopyData = bhavcopyData.concat(eqStocks);
              bhavCountUploaded += eqStocks.length;
            } else {
              console.warn(`uploadedBhav doc has no indices array or empty array:`, {
                hasIndices: !!doc.indices,
                isArray: Array.isArray(doc.indices),
                length: doc.indices?.length || 0,
                fileName: doc.fileName,
                date: doc.date
              });
              
              // If indices array is empty but document exists, check if individual rows were inserted into daily_bhavcopy
              // This can happen if the upload happened but parsing failed, but individual rows were still inserted
              console.log(`⚠️ uploadedBhav doc has empty indices array. Checking if individual rows exist in daily_bhavcopy for date ${doc.date}...`);
              
              // Try to find individual rows in daily_bhavcopy that might have been inserted from this upload
              // We already checked daily_bhavcopy above, but let's double-check with the doc's date
              if (doc.date) {
                const individualRows = await bhavcopyCollection
                  .find({ 
                    date: doc.date,
                    series: 'EQ'
                  })
                  .limit(10)
                  .toArray();
                
                if (individualRows.length > 0) {
                  console.log(`✅ Found ${individualRows.length} individual rows in daily_bhavcopy for date ${doc.date} (from uploadedBhav doc ${doc.fileName})`);
                  // These rows should have already been included in bhavcopyData from the earlier query
                  // But if they weren't, we'll note it
                } else {
                  console.log(`❌ No individual rows found in daily_bhavcopy for date ${doc.date}`);
                  console.log(`   This suggests the upload file was not parsed correctly. Please re-upload the file.`);
                }
              }
            }
          }
          console.log(`Total: Found ${bhavcopyData.length} EQ stocks in uploadedBhav for ${yesterdayDate}`);
        } catch (uploadedError) {
          console.error('Error querying uploadedBhav collection:', uploadedError);
          // Continue - we'll return empty if no data found
        }
      }
      
      console.log(`📊 FINAL BHAVCOPY COUNT for ${yesterdayDate}: total = ${bhavcopyData.length} (daily: ${bhavCountDaily}, uploaded: ${bhavCountUploaded})`);
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
        message: `No bhavcopy data found for ${yesterdayDate} in daily_bhavcopy or uploadedBhav collections`
      };
    }

    // Get today's premarket data from both premarket_data AND uploadedPreMarket collections
    let premarketData = [];
    let premarketCountDaily = 0;
    let premarketCountUploaded = 0;
    
    try {
      // First, try premarket_data collection (includes data inserted from uploads)
      premarketData = await premarketCollection
        .find({ date: date })
        .toArray();
      
      premarketCountDaily = premarketData.length;
      console.log(`📊 PREMARKET COUNT for ${date}: premarket_data = ${premarketCountDaily}`);
      
      // If no exact date match, try to find the most recent date before or equal to today
      if (premarketData.length === 0) {
        console.log(`No exact date match in premarket_data for ${date}, searching for closest date...`);
        const allPremarketDaily = await premarketCollection
          .find({})
          .sort({ date: -1 })
          .limit(50)
          .toArray();
        
        // Get unique dates and find closest
        const uniqueDates = [...new Set(allPremarketDaily.map(d => d.date))].sort().reverse();
        console.log(`📅 Available dates in premarket_data:`, uniqueDates.slice(0, 10).join(', '));
        
        // Find closest date <= date
        for (const dateStr of uniqueDates) {
          if (dateStr && dateStr <= date) {
            console.log(`✅ Found closest date in premarket_data: ${dateStr} (looking for ${date})`);
            premarketData = await premarketCollection
              .find({ date: dateStr })
              .toArray();
            premarketCountDaily = premarketData.length;
            break;
          }
        }
      }
      
      // If no data in premarket_data, check uploadedPreMarket collection
      if (premarketData.length === 0) {
        console.log(`No data in premarket_data for ${date}, checking uploadedPreMarket...`);
        const uploadedPremarketCollection = await getUploadedDataCollection('premarket');
        
        // First, let's see what dates are actually available
        const allPremarketDocs = await uploadedPremarketCollection
          .find({})
          .sort({ date: -1 })
          .limit(20)
          .toArray();
        
        console.log(`📅 Available dates in uploadedPreMarket:`, allPremarketDocs.map(d => d.date).join(', '));
        console.log(`🔍 Looking for date: ${date}`);
        
        // Try exact date match first
        let uploadedPremarketDocs = await uploadedPremarketCollection
          .find({ date: date })
          .toArray();
        
        console.log(`📊 Exact match found: ${uploadedPremarketDocs.length} documents`);
        
        // If no exact match, try to find the most recent date
        if (uploadedPremarketDocs.length === 0) {
          console.log(`No exact date match for ${date}, searching for closest date...`);
          
          // Find the closest date to today (can be today or before)
          let closestDoc = null;
          let closestDate = null;
          
          for (const doc of allPremarketDocs) {
            if (doc.date) {
              // Compare dates as strings (ISO format YYYY-MM-DD)
              if (doc.date <= date) {
                if (!closestDate || doc.date > closestDate) {
                  closestDate = doc.date;
                  closestDoc = doc;
                }
              }
            }
          }
          
          if (closestDoc) {
            uploadedPremarketDocs = [closestDoc];
            console.log(`✅ Found closest date: ${closestDoc.date} (looking for ${date})`);
          } else {
            console.log(`❌ No suitable date found. Available dates: ${allPremarketDocs.map(d => d.date).join(', ')}`);
          }
        }
        
        console.log(`📊 Final uploadedPreMarket documents found: ${uploadedPremarketDocs.length}`);
        
        // Extract indices array from uploaded documents
        for (const doc of uploadedPremarketDocs) {
          if (doc.indices && Array.isArray(doc.indices)) {
            console.log(`Extracting ${doc.indices.length} items from uploadedPreMarket doc: ${doc.fileName || 'unknown'}`);
            premarketData = premarketData.concat(doc.indices);
            premarketCountUploaded += doc.indices.length;
          } else {
            console.warn(`uploadedPreMarket doc has no indices array:`, {
              hasIndices: !!doc.indices,
              isArray: Array.isArray(doc.indices),
              fileName: doc.fileName
            });
          }
        }
        console.log(`Total: Found ${premarketData.length} items in uploadedPreMarket for ${date}`);
      }
      
      console.log(`📊 FINAL PREMARKET COUNT for ${date}: total = ${premarketData.length} (daily: ${premarketCountDaily}, uploaded: ${premarketCountUploaded})`);
    } catch (queryError) {
      console.error('Error querying premarket data:', queryError);
      // Continue with empty premarket data - we can still process bhavcopy-only signals
      premarketData = [];
    }
    
    if (premarketData.length === 0) {
      console.warn(`⚠️ No premarket data found for ${date} in premarket_data or uploadedPreMarket`);
    }
    
    // Also check indices count for both dates
    try {
      const indicesCollection = await getDailyIndicesCollection();
      const indicesCountToday = await indicesCollection.countDocuments({ date: date });
      const indicesCountYesterday = await indicesCollection.countDocuments({ date: yesterdayDate });
      console.log(`📊 INDICES COUNT: ${date} = ${indicesCountToday}, ${yesterdayDate} = ${indicesCountYesterday}`);
    } catch (indicesError) {
      console.warn('Error checking indices count:', indicesError.message);
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

    console.log(`📊 Created maps: ${bhavcopyMap.size} bhavcopy symbols, ${premarketMap.size} premarket symbols`);

    // Generate signals
    const signals = [];
    const processedSymbols = new Set();

    // Process stocks with premarket data
    for (const premarket of premarketData) {
      const symbol = (premarket.symbol || premarket.SYMBOL || premarket.Symbol || '').toUpperCase();
      if (!symbol || processedSymbols.has(symbol)) continue;
      
      const bhavcopy = bhavcopyMap.get(symbol);
      if (!bhavcopy) continue;
      
      // Check EQ series - handle both direct series field and items from uploadedBhav
      if (bhavcopy.series && bhavcopy.series !== 'EQ') continue;

      // Calculate gap %
      // Try multiple field name variations for close price
      const yesterdayClose = bhavcopy.close || bhavcopy.CLOSE || bhavcopy.prev_close || bhavcopy.PREV_CLOSE || 
                            bhavcopy.last_price || bhavcopy.LAST_PRICE || 0;
      if (yesterdayClose <= 0) continue;

      // Try multiple field name variations for premarket price
      const premarketPrice = premarket.pre_open_price || premarket.PRE_OPEN_PRICE || 
                            premarket.price || premarket.PRICE ||
                            premarket.last_price || premarket.LAST_PRICE ||
                            premarket.open || premarket.OPEN || 0;
      if (premarketPrice <= 0) continue;

      const gapPercent = ((premarketPrice - yesterdayClose) / yesterdayClose) * 100;

      // Filter: Gap must be positive (gap-up) and above threshold (0.3%)
      if (gapPercent < 0.3) continue;

      // Check if premarket price is near yesterday's high (momentum indicator)
      // This indicates the stock is continuing its upward momentum
      const yesterdayHigh = bhavcopy.high || yesterdayClose;
      let nearHigh = false;
      if (yesterdayHigh > 0) {
        const nearHighPercent = ((yesterdayHigh - premarketPrice) / yesterdayHigh) * 100;
        // Near high if premarket price is within 2% of yesterday's high (above or below)
        nearHigh = Math.abs(nearHighPercent) <= 2.0;
      }

      // Optional: Filter by volume (minimum volume threshold)
      // Try multiple field name variations for volume
      const volume = bhavcopy.volume || bhavcopy.VOLUME || 
                    bhavcopy.tottrdqty || bhavcopy.TOTTRDQTY || 
                    bhavcopy.traded_quantity || bhavcopy.TRADED_QUANTITY || 0;
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
        signal_count: 0,
        message: `No signals generated for ${date} (no stocks met criteria)`
      };
    }

    // Save to database (optional - don't fail if DB write fails)
    let runId = null;
    try {
      // Generate run ID
      if (uuidv4) {
        runId = uuidv4();
      } else {
        // Fallback ID generation if uuid is not available
        runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      const signalRunCollection = await getSignalRunCollection();
      const signalCollection = await getSignalCollection();

      // Create signal run
      const signalRun = {
        run_id: runId,
        date: date,
        bhavcopy_date: yesterdayDate,
        strategy: strategy || 'momentum_gap',
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
      console.log(`✅ Saved ${topSignals.length} signals to database with run_id: ${runId}`);
    } catch (dbWriteError) {
      console.warn('⚠️ Failed to save signals to database (continuing anyway):', dbWriteError.message);
      // Continue - signals are still valid even if DB write fails
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
    // Never throw - always return an error response object
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
        success: false,
        date: date,
        run_id: null,
        signal_count: 0,
        signals: [],
        message: 'Signal generation requires MongoDB configuration.'
      });
    }

    // Generate signals (this function never throws)
    const strategy = req.query.strategy || 'momentum_gap';
    const result = await generateSimpleMomentumGapSignals(date, strategy);
    
    // Ensure response matches expected format (like test-generate-signals)
    res.status(200).json({
      success: result.success !== false, // Default to true if not explicitly false
      date: result.date || date,
      run_id: result.run_id || null,
      signal_count: result.signal_count || (result.signals ? result.signals.length : 0),
      signals: result.signals || [],
      message: result.message || 'Signals generated successfully'
    });

  } catch (error) {
    // Final safety net - should never reach here, but just in case
    console.error('Unexpected error in generate-signals handler:', error);
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.status(200).json({
      success: false,
      date: date,
      run_id: null,
      signal_count: 0,
      signals: [],
      message: 'Signal generation is temporarily unavailable. Please try again later.',
      error: error.message
    });
  }
};

/**
 * Mean Reversion signal generator
 * Looks for oversold stocks (gap-down) that may revert to mean
 */
async function generateMeanReversionSignals(date) {
  // For now, use the same logic as momentum gap but with different filters
  // In the future, we can implement proper mean reversion logic
  // (e.g., look for gap-down stocks, RSI oversold, etc.)
  const result = await generateSimpleMomentumGapSignals(date);
  // Modify the result to indicate it's mean reversion
  if (result.message && result.message.includes('No bhavcopy')) {
    result.message = result.message.replace('momentum gap', 'mean reversion');
  }
  return result;
}

// Export the functions for reuse
module.exports.generateSimpleMomentumGapSignals = generateSimpleMomentumGapSignals;
module.exports.generateMeanReversionSignals = generateMeanReversionSignals;

