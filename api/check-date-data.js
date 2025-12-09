const { 
  getDailyBhavcopyCollection, 
  getDailyIndicesCollection, 
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection
} = require('./lib/mongodb');

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

      // Count documents for each collection for the given date
      const bhavcopyCount = await bhavcopyCollection.countDocuments({ date: date });
      const indicesCount = await indicesCollection.countDocuments({ date: date });
      const premarketCount = await premarketCollection.countDocuments({ date: date });

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
      
      // Can generate signals if we have both bhavcopy and indices (premarket is optional)
      const canGenerateSignals = hasBhav && hasIndices;

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
          ? `Data available for ${date}. Signals can be generated.`
          : `Incomplete data for ${date}. Need bhavcopy and indices to generate signals.`
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

