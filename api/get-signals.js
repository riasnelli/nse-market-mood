const { getSignalCollection, getSignalRunCollection } = require('./lib/mongodb');

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
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    
    if (!mongoUri) {
      // MongoDB not configured - return empty signals
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

      // Find signal run for this date
      const signalRun = await signalRunCollection.findOne({ date: date });
      
      if (signalRun && signalRun.run_id) {
        // Find signals for this run
        const signals = await signalCollection
          .find({ run_id: signalRun.run_id })
          .sort({ score: -1 })
          .toArray();

        // Transform signals to match frontend expectations
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

      // No signals in DB - return empty (frontend can call generate-signals if needed)
      // We don't auto-generate here to avoid circular dependencies
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
  } catch (error) {
    console.error('Error in get-signals:', error);
    const date = req.query.date || new Date().toISOString().split('T')[0];
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
};

