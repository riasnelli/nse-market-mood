const { getDailyIndicesCollection } = require('./lib/mongodb');

// In-memory cache for index history data
let cache = {
  data: null,
  timestamp: null,
  ttl: 15 * 60 * 1000 // 15 minutes in milliseconds
};

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

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: `Method ${req.method} is not supported`
    });
  }

  try {
    // Check cache first
    const now = Date.now();
    if (cache.data && cache.timestamp && (now - cache.timestamp) < cache.ttl) {
      console.log('✅ Returning cached index history data');
      return res.status(200).json(cache.data);
    }

    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      return res.status(200).json({});
    }

    // Get collection
    const collection = await getDailyIndicesCollection();

    // Calculate date range: last 14 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);

    // Format dates as YYYY-MM-DD
    const formatDate = (date) => date.toISOString().split('T')[0];
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`Fetching index history from ${startDateStr} to ${endDateStr}`);

    // Fetch all index data for the last 14 days
    let allData = [];
    try {
      allData = await collection
        .find({
          date: {
            $gte: startDateStr,
            $lte: endDateStr
          }
        })
        .sort({ date: 1, symbol: 1 })
        .toArray();
    } catch (error) {
      console.warn('Error fetching from daily_indices collection:', error.message);
      // If daily_indices doesn't exist or has no data, try uploadedIndices as fallback
      const { getUploadedDataCollection } = require('./lib/mongodb');
      const uploadedCollection = await getUploadedDataCollection('indices');
      
      try {
        const uploadedData = await uploadedCollection
          .find({
            date: {
              $gte: startDateStr,
              $lte: endDateStr
            }
          })
          .sort({ date: -1 })
          .toArray();
        
        // Transform uploadedIndices format to match daily_indices format
        uploadedData.forEach(doc => {
          if (doc.indices && Array.isArray(doc.indices)) {
            doc.indices.forEach(index => {
              allData.push({
                date: doc.date,
                symbol: index.symbol,
                last_price: index.lastPrice,
                lastPrice: index.lastPrice,
                close: index.lastPrice
              });
            });
          }
        });
        console.log(`Found ${allData.length} index records from uploadedIndices fallback`);
      } catch (fallbackError) {
        console.warn('Fallback to uploadedIndices also failed:', fallbackError.message);
      }
    }

    console.log(`Found ${allData.length} index records`);

    // Group data by symbol
    const groupedData = {};

    allData.forEach(item => {
      const symbol = item.symbol;
      if (!symbol) return;

      if (!groupedData[symbol]) {
        groupedData[symbol] = [];
      }

      // Extract date and last_price (or close price)
      const price = item.last_price || item.lastPrice || item.close || item.close_price;
      if (price != null && item.date) {
        groupedData[symbol].push({
          date: item.date,
          close: typeof price === 'number' ? price : parseFloat(price)
        });
      }
    });

    // Sort each symbol's data by date ascending and limit to 14 days
    Object.keys(groupedData).forEach(symbol => {
      groupedData[symbol].sort((a, b) => a.date.localeCompare(b.date));
      // Take only the last 14 entries (in case there are duplicates)
      groupedData[symbol] = groupedData[symbol].slice(-14);
    });

    // Update cache
    cache.data = groupedData;
    cache.timestamp = now;

    console.log(`✅ Returning index history for ${Object.keys(groupedData).length} indices`);

    return res.status(200).json(groupedData);

  } catch (error) {
    console.error('❌ Error in index-history:', error);
    
    // Return cached data if available, even if expired
    if (cache.data) {
      console.log('⚠️ Returning stale cache due to error');
      return res.status(200).json(cache.data);
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

