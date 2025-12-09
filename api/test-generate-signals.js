// Stub endpoint for test signal generation
// Returns an empty signals list for now

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
    
    // Return empty signals list with proper structure
    // In the future, this would call the signal generation engine
    res.status(200).json({
      date: today,
      run_id: null,
      signal_count: 0,
      signals: [],
      message: 'Test signal generation is not yet implemented. Please check back later.'
    });
  } catch (error) {
    console.error('Error in test-generate-signals:', error);
    res.status(500).json({ 
      error: 'Failed to generate test signals',
      message: error.message 
    });
  }
};

