const { 
  getDailyBhavcopyCollection, 
  getDailyIndicesCollection, 
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection,
  getUploadedDataCollection
} = require('./lib/mongodb');

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

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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
    const date = req.query.date;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required',
        message: 'Please provide a date query parameter (YYYY-MM-DD)'
      });
    }

    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    
    if (!mongoUri) {
      // MongoDB not configured - return stub data with all required fields
      return res.status(200).json({
        success: true,
        date: date,
        canGenerateSignals: false,
        data: {
          bhavcopy: {
            available: false,
            count: 0
          },
          indices: {
            available: false,
            count: 0
          },
          premarket: {
            available: false,
            count: 0
          },
          signals: {
            available: false,
            count: 0
          },
          signalRuns: {
            count: 0,
            runs: []
          }
        },
        hasBhav: false,
        hasPremarket: false,
        hasIndices: false,
        message: 'Data availability check requires MongoDB configuration.'
      });
    }

    // Check actual data availability in database
    try {
      const bhavcopyCollection = await getDailyBhavcopyCollection();
      const indicesCollection = await getDailyIndicesCollection();
      const premarketCollection = await getPreMarketDataCollection();
      const signalCollection = await getSignalCollection();
      const signalRunCollection = await getSignalRunCollection();
      const uploadedBhavCollection = await getUploadedDataCollection('bhav');
      const uploadedPremarketCollection = await getUploadedDataCollection('premarket');

      // For signal generation:
      // Data availability timeline:
      // - Indices & Bhavcopy: Only available AFTER market hours (end of day data)
      // - Premarket: Available BEFORE market opens (pre-open prices)
      // 
      // For signals on DATE (today):
      // - Bhavcopy: Needed for YESTERDAY (previous trading day's EOD data)
      // - Premarket: Needed for TODAY (target date's pre-open data)
      // - Indices: Needed for YESTERDAY (previous trading day's EOD data, used for context)
      const yesterdayDate = getYesterdayDate(date);
      
      // Count bhavcopy data (yesterday's date)
      let bhavcopyCount = await bhavcopyCollection.countDocuments({ 
        date: yesterdayDate,
        series: 'EQ' 
      });
      
      // Also check uploadedBhav for yesterday (and try closest date if no exact match)
      if (bhavcopyCount === 0) {
        let uploadedBhavDocs = await uploadedBhavCollection
          .find({ date: yesterdayDate })
          .toArray();
        
        // If no exact match, try to find closest date
        if (uploadedBhavDocs.length === 0) {
          const allBhavDocs = await uploadedBhavCollection
            .find({})
            .sort({ date: -1 })
            .limit(20)
            .toArray();
          
          // Find closest date <= yesterdayDate
          for (const doc of allBhavDocs) {
            if (doc.date && doc.date <= yesterdayDate) {
              uploadedBhavDocs = [doc];
              console.log(`Found closest uploadedBhav date: ${doc.date} (looking for ${yesterdayDate})`);
              break;
            }
          }
        }
        
        // Count EQ stocks in uploaded bhav
        for (const doc of uploadedBhavDocs) {
          if (doc.indices && Array.isArray(doc.indices)) {
            const eqCount = doc.indices.filter(item => !item.series || item.series === 'EQ').length;
            bhavcopyCount += eqCount;
          }
        }
      }
      
      // Count indices data (check both today and yesterday)
      let indicesCount = await indicesCollection.countDocuments({ date: date });
      if (indicesCount === 0) {
        indicesCount = await indicesCollection.countDocuments({ date: yesterdayDate });
      }
      
      // Count premarket data (today's date)
      let premarketCount = await premarketCollection.countDocuments({ date: date });
      
      // Also check uploadedPreMarket for today (and try closest date if no exact match)
      if (premarketCount === 0) {
        let uploadedPremarketDocs = await uploadedPremarketCollection
          .find({ date: date })
          .toArray();
        
        // If no exact match, try to find closest date
        if (uploadedPremarketDocs.length === 0) {
          const allPremarketDocs = await uploadedPremarketCollection
            .find({})
            .sort({ date: -1 })
            .limit(20)
            .toArray();
          
          // Find closest date <= date
          for (const doc of allPremarketDocs) {
            if (doc.date && doc.date <= date) {
              uploadedPremarketDocs = [doc];
              console.log(`Found closest uploadedPreMarket date: ${doc.date} (looking for ${date})`);
              break;
            }
          }
        }
        
        // Count items in uploaded premarket
        for (const doc of uploadedPremarketDocs) {
          if (doc.indices && Array.isArray(doc.indices)) {
            premarketCount += doc.indices.length;
          }
        }
      }

      // Check for signals - find signal run for this date
      const signalRun = await signalRunCollection.findOne({ date: date });
      let signalsCount = 0;
      if (signalRun && signalRun.run_id) {
        signalsCount = await signalCollection.countDocuments({ run_id: signalRun.run_id });
      }

      // Get signal runs for this date
      const signalRuns = await signalRunCollection
        .find({ date: date })
        .sort({ created_at: -1 })
        .toArray();

      const hasBhav = bhavcopyCount > 0;
      const hasIndices = indicesCount > 0;
      const hasPremarket = premarketCount > 0;
      const hasSignals = signalsCount > 0;
      
      // Can generate signals if we have:
      // - Bhavcopy (yesterday) - REQUIRED
      // - Premarket (today) - REQUIRED for momentum gap strategy
      // - Indices (today or yesterday) - OPTIONAL but helpful
      const canGenerateSignals = hasBhav && hasPremarket;

      res.status(200).json({
        success: true,
        date: date,
        canGenerateSignals: canGenerateSignals,
        data: {
          bhavcopy: {
            available: hasBhav,
            count: bhavcopyCount
          },
          indices: {
            available: hasIndices,
            count: indicesCount
          },
          premarket: {
            available: hasPremarket,
            count: premarketCount
          },
          signals: {
            available: hasSignals,
            count: signalsCount
          },
          signalRuns: {
            count: signalRuns.length,
            runs: signalRuns.map(run => ({
              run_id: run.run_id,
              regime_code: run.regime_code,
              strategies_used: run.strategies_used
            }))
          }
        },
        hasBhav: hasBhav,
        hasPremarket: hasPremarket,
        hasIndices: hasIndices,
        message: canGenerateSignals 
          ? `Data available for ${date}. Signals can be generated (bhavcopy: ${yesterdayDate}, premarket: ${date}).`
          : `Incomplete data for ${date}. Need bhavcopy (${yesterdayDate}) and premarket (${date}) to generate signals.`
      });
    } catch (dbError) {
      console.warn('Error querying database for data availability:', dbError.message);
      // Fallback to stub data if database query fails
      res.status(200).json({
        success: true,
        date: date,
        canGenerateSignals: false,
        data: {
          bhavcopy: {
            available: false,
            count: 0
          },
          indices: {
            available: false,
            count: 0
          },
          premarket: {
            available: false,
            count: 0
          },
          signals: {
            available: false,
            count: 0
          },
          signalRuns: {
            count: 0,
            runs: []
          }
        },
        hasBhav: false,
        hasPremarket: false,
        hasIndices: false,
        message: 'Error checking data availability'
      });
    }
  } catch (error) {
    console.error('Error in check-date-data:', error);
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.status(200).json({
      success: false,
      date: date,
      canGenerateSignals: false,
      data: {
        bhavcopy: { available: false, count: 0 },
        indices: { available: false, count: 0 },
        premarket: { available: false, count: 0 },
        signals: { available: false, count: 0 },
        signalRuns: { count: 0, runs: [] }
      },
      hasBhav: false,
      hasPremarket: false,
      hasIndices: false,
      error: error.message,
      message: 'Failed to check data availability'
    });
  }
};

