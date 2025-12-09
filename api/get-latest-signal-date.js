// Stub endpoint for getting the latest signal date
// Returns a date that can be used for signal generation

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
    // For now, return today's date as the latest available date
    // In the future, this would query the database for the latest date with complete data
    const today = new Date().toISOString().split('T')[0];
    
    res.status(200).json({
      latest_complete_date: today,
      dates: {
        bhavcopy: today,
        indices: today,
        premarket: today
      },
      message: 'Using today as the latest available date'
    });
  } catch (error) {
    console.error('Error in get-latest-signal-date:', error);
    res.status(500).json({ 
      error: 'Failed to get latest signal date',
      message: error.message 
    });
  }
};

