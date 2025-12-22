const { 
  getDailyBhavcopyCollection, 
  getDailyIndicesCollection, 
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection,
  getUploadedDataCollection
} = require('./lib/mongodb');

/**
 * Get yesterday's date (skip weekends)
 */
function getYesterdayDate(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  // Skip weekends - go back to Friday if today is Monday
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

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
      message: `Method ${req.method} is not supported`,
      allowed: ['GET']
    });
  }

  try {
    // Get action from query params
    const action = req.query.action;
    
    // Validate action
    const validActions = ['check-date', 'history', 'index-history'];
    if (action && !validActions.includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action',
        validActions,
        message: `Action must be one of: ${validActions.join(', ')}`
      });
    }

    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    
    if (action === 'check-date') {
      // Check date data availability (check-date-data.js logic)
      const date = req.query.date;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Date parameter is required',
          message: 'Please provide a date query parameter (YYYY-MM-DD)'
        });
      }

      if (!mongoUri) {
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
        const uploadedBhavCollection = await getUploadedDataCollection('bhav');
        const uploadedPremarketCollection = await getUploadedDataCollection('premarket');

        const yesterdayDate = getYesterdayDate(date);
        
        // Count bhavcopy data (yesterday's date)
        let bhavcopyCount = await bhavcopyCollection.countDocuments({ 
          date: yesterdayDate,
          series: 'EQ' 
        });
        
        // Also check uploadedBhav for yesterday
        if (bhavcopyCount === 0) {
          let uploadedBhavDocs = await uploadedBhavCollection
            .find({ date: yesterdayDate })
            .toArray();
          
          // If no exact match, try to find closest date
          if (uploadedBhavDocs.length === 0) {
            const allBhavDocs = await uploadedBhavCollection
              .find({})
              .sort({ date: -1 })
              .limit(20)
              .toArray();
            
            for (const doc of allBhavDocs) {
              if (doc.date && doc.date <= yesterdayDate) {
                uploadedBhavDocs = [doc];
                console.log(`Found closest uploadedBhav date: ${doc.date} (looking for ${yesterdayDate})`);
                break;
              }
            }
          }
          
          // Count EQ stocks in uploaded bhav
          for (const doc of uploadedBhavDocs) {
            if (doc.indices && Array.isArray(doc.indices)) {
              const eqCount = doc.indices.filter(item => !item.series || item.series === 'EQ').length;
              bhavcopyCount += eqCount;
            }
          }
        }
        
        // Count indices data (check both today and yesterday)
        let indicesCount = await indicesCollection.countDocuments({ date: date });
        if (indicesCount === 0) {
          indicesCount = await indicesCollection.countDocuments({ date: yesterdayDate });
        }
        
        // Count premarket data (today's date)
        let premarketCount = await premarketCollection.countDocuments({ date: date });
        
        // Also check uploadedPreMarket for today
        if (premarketCount === 0) {
          let uploadedPremarketDocs = await uploadedPremarketCollection
            .find({ date: date })
            .toArray();
          
          // If no exact match, try to find closest date
          if (uploadedPremarketDocs.length === 0) {
            const allPremarketDocs = await uploadedPremarketCollection
              .find({})
              .sort({ date: -1 })
              .limit(20)
              .toArray();
            
            for (const doc of allPremarketDocs) {
              if (doc.date && doc.date <= date) {
                uploadedPremarketDocs = [doc];
                console.log(`Found closest uploadedPreMarket date: ${doc.date} (looking for ${date})`);
                break;
              }
            }
          }
          
          // Count items in uploaded premarket
          for (const doc of uploadedPremarketDocs) {
            if (doc.indices && Array.isArray(doc.indices)) {
              premarketCount += doc.indices.length;
            }
          }
        }

        // Check for signals
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
        
        const canGenerateSignals = hasBhav && hasPremarket;

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
            ? `Data available for ${date}. Signals can be generated (bhavcopy: ${yesterdayDate}, premarket: ${date}).`
            : `Incomplete data for ${date}. Need bhavcopy (${yesterdayDate}) and premarket (${date}) to generate signals.`
        });
      } catch (dbError) {
        console.warn('Error querying database for data availability:', dbError.message);
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

    } else if (action === 'history') {
      // Get index history (index-history.js logic)
      // Check cache first
      const now = Date.now();
      if (cache.data && cache.timestamp && (now - cache.timestamp) < cache.ttl) {
        console.log('✅ Returning cached index history data');
        return res.status(200).json(cache.data);
      }

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

    } else {
      // No action specified - return error
      return res.status(400).json({
        error: 'Action parameter is required',
        validActions: ['check-date', 'history'],
        message: 'Please provide an action query parameter: check-date or history'
      });
    }
  } catch (error) {
    console.error('❌ Error in market endpoint:', error);
    
    // For history action, return cached data if available
    if (req.query.action === 'history' && cache.data) {
      console.log('⚠️ Returning stale cache due to error');
      return res.status(200).json(cache.data);
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

