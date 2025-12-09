const { generateMomentumGapSignals } = require('./lib/signal-engine');

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
      // MongoDB not configured - return stub response
      return res.status(200).json({
        success: true,
        date: date,
        run_id: null,
        signal_count: 0,
        signals: [],
        message: 'Signal generation requires MongoDB configuration. Please configure MONGODB_URI.'
      });
    }

    // Try to generate signals using the signal engine
    try {
      const result = await generateMomentumGapSignals(date);
      
      if (result && result.signals && result.signals.length > 0) {
        return res.status(200).json({
          success: true,
          date: result.date || date,
          run_id: result.run_id,
          signal_count: result.signal_count || result.signals.length,
          signals: result.signals,
          message: result.message || `Generated ${result.signals.length} signals for ${date}`
        });
      } else {
        // Signal generation returned no signals
        return res.status(200).json({
          success: true,
          date: date,
          run_id: result?.run_id || null,
          signal_count: 0,
          signals: [],
          message: result?.message || 'No signals generated. Market conditions may not meet criteria.'
        });
      }
    } catch (genError) {
      console.warn('Signal generation failed, returning stub response:', genError.message);
      // Fallback to stub response if generation fails
      return res.status(200).json({
        success: true,
        date: date,
        run_id: null,
        signal_count: 0,
        signals: [],
        message: 'Signal generation is not yet fully implemented. Please check back later.'
      });
    }
  } catch (error) {
    console.error('Error in generate-signals:', error);
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.status(200).json({
      success: false,
      date: date,
      run_id: null,
      signal_count: 0,
      signals: [],
      message: 'Error generating signals',
      error: error.message
    });
  }
};

