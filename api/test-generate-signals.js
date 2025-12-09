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
    const today = new Date().toISOString().split('T')[0];
    
    // Stub implementation - return fixed JSON payload for debugging
    // This is a test endpoint, so it returns a consistent response
    res.status(200).json({
      date: today,
      run_id: 'test-run-' + Date.now(),
      signal_count: 0,
      signals: [],
      message: 'Test signal generation stub - returns empty signals array for debugging',
      debug: true
    });
  } catch (error) {
    console.error('Error in test-generate-signals:', error);
    const today = new Date().toISOString().split('T')[0];
    res.status(200).json({
      date: today,
      run_id: null,
      signal_count: 0,
      signals: [],
      message: 'Error generating test signals',
      error: error.message
    });
  }
};

