const { getUploadedDataCollection } = require('./lib/mongodb');

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
    const { date, type } = req.query;

    if (!date) {
      return res.status(400).json({
        error: 'Date parameter is required',
        message: 'Please provide a date query parameter'
      });
    }

    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      return res.status(404).json({
        error: 'Database not configured',
        message: 'MongoDB is not configured. Please check uploaded data in localStorage.'
      });
    }

    // Get type from query parameter, default to 'indices'
    const uploadType = type || 'indices';
    const collection = await getUploadedDataCollection(uploadType);
    
    // Find data for the specified date
    const data = await collection.findOne({ date: date });

    if (!data) {
      return res.status(404).json({
        error: 'Data not found',
        message: `No data found for date: ${date}`
      });
    }

    // Return the data in the expected format
    res.status(200).json({
      date: data.date,
      fileName: data.fileName || `Uploaded CSV - ${data.date}`,
      type: data.type || uploadType,
      indices: data.indices || [],
      mood: data.mood || null,
      vix: data.vix || null,
      advanceDecline: data.advanceDecline || { advances: 0, declines: 0 },
      source: 'database'
    });
  } catch (error) {
    console.error('Error fetching uploaded data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

