const { generateMomentumGapSignals } = require('./lib/signal-engine');
const { 
  getDailyBhavcopyCollection, 
  getDailyIndicesCollection
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

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      return res.status(500).json({ error: 'MongoDB not configured' });
    }

    // Get today's date (for premarket data)
    const today = new Date();
    // Adjust for IST timezone (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(today.getTime() + istOffset);
    const todayDate = istTime.toISOString().split('T')[0];

    // Get latest premarket date (should be today)
    const { getPreMarketDataCollection } = require('./lib/mongodb');
    const preMarketCollection = await getPreMarketDataCollection();
    const latestPremarket = await preMarketCollection
      .findOne({}, { sort: { date: -1 }, projection: { date: 1 } });

    // Use today's date or latest premarket date
    const premarketDate = latestPremarket?.date || todayDate;

    // Get latest date with bhavcopy and indices data (should be yesterday)
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const indicesCollection = await getDailyIndicesCollection();

    const latestBhavcopy = await bhavcopyCollection
      .findOne({}, { sort: { date: -1 }, projection: { date: 1 } });
    
    const latestIndices = await indicesCollection
      .findOne({}, { sort: { date: -1 }, projection: { date: 1 } });

    if (!latestBhavcopy || !latestIndices) {
      return res.status(404).json({ 
        error: 'No data found',
        message: 'No bhavcopy or indices data found in database'
      });
    }

    // Use the latest date that has both bhavcopy and indices (yesterday)
    const dates = [latestBhavcopy.date, latestIndices.date]
      .filter(Boolean)
      .sort()
      .reverse();

    const bhavcopyDate = dates[0];

    if (!bhavcopyDate) {
      return res.status(404).json({ 
        error: 'No valid date found',
        message: 'Could not determine latest date with bhavcopy/indices data'
      });
    }

    // Check data counts
    const premarketCount = await preMarketCollection.countDocuments({ date: premarketDate });
    const bhavcopyCount = await bhavcopyCollection.countDocuments({ date: bhavcopyDate });
    const indicesCount = await indicesCollection.countDocuments({ date: bhavcopyDate });

    console.log(`Generating signals: Premarket date=${premarketDate} (${premarketCount} records), Bhavcopy/Indices date=${bhavcopyDate} (${bhavcopyCount}/${indicesCount} records)`);

    // Generate signals using today's premarket + yesterday's bhavcopy/indices
    const result = await generateMomentumGapSignals(premarketDate);

    res.status(200).json({
      success: true,
      premarket_date: premarketDate,
      bhavcopy_date: bhavcopyDate,
      data_counts: {
        premarket: premarketCount,
        bhavcopy: bhavcopyCount,
        indices: indicesCount
      },
      ...result
    });
  } catch (error) {
    console.error('Error generating signals:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

