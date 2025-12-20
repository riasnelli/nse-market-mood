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

// Import the existing signal generation logic from signals.js
const signalsModule = require('../signals');
const generateSimpleMomentumGapSignals = signalsModule.generateSimpleMomentumGapSignals;

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
  checkDataAvailability
};

