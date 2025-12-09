const { 
  getDailyBhavcopyCollection, 
  getDailyIndicesCollection, 
  getPreMarketDataCollection 
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
    const today = new Date().toISOString().split('T')[0];
    
    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    
    if (!mongoUri) {
      // MongoDB not configured - return today's date as fallback
      return res.status(200).json({
        latest_complete_date: today,
        dates: {
          bhavcopy: today,
          indices: today,
          premarket: today
        },
        message: 'Using today as the latest available date (MongoDB not configured)'
      });
    }

    // Try to get latest dates from MongoDB collections
    try {
      const bhavcopyCollection = await getDailyBhavcopyCollection();
      const indicesCollection = await getDailyIndicesCollection();
      const premarketCollection = await getPreMarketDataCollection();

      // Get latest date from each collection
      const [latestBhavcopy] = await bhavcopyCollection
        .find({})
        .sort({ date: -1 })
        .limit(1)
        .toArray();
      
      const [latestIndices] = await indicesCollection
        .find({})
        .sort({ date: -1 })
        .limit(1)
        .toArray();
      
      const [latestPremarket] = await premarketCollection
        .find({})
        .sort({ date: -1 })
        .limit(1)
        .toArray();

      const dates = {
        bhavcopy: latestBhavcopy?.date || today,
        indices: latestIndices?.date || today,
        premarket: latestPremarket?.date || today
      };

      // Use the most recent date as latest_complete_date
      const allDates = [dates.bhavcopy, dates.indices, dates.premarket]
        .filter(Boolean)
        .sort()
        .reverse();
      
      const latestCompleteDate = allDates[0] || today;

      res.status(200).json({
        latest_complete_date: latestCompleteDate,
        dates: dates,
        message: 'Latest dates retrieved from database'
      });
    } catch (dbError) {
      console.warn('Error querying database for latest dates, using today:', dbError.message);
      // Fallback to today if database query fails
      res.status(200).json({
        latest_complete_date: today,
        dates: {
          bhavcopy: today,
          indices: today,
          premarket: today
        },
        message: 'Using today as the latest available date (database query failed)'
      });
    }
  } catch (error) {
    console.error('Error in get-latest-signal-date:', error);
    const today = new Date().toISOString().split('T')[0];
    res.status(200).json({
      latest_complete_date: today,
      dates: {
        bhavcopy: today,
        indices: today,
        premarket: today
      },
      message: 'Using today as fallback date',
      error: error.message
    });
  }
};

