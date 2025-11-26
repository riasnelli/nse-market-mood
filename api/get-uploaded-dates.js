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
    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      return res.status(200).json([]);
    }

    const collection = await getUploadedDataCollection();
    
    // Get all unique dates with their indices count
    const dates = await collection.aggregate([
      {
        $group: {
          _id: '$date',
          count: { $sum: { $size: { $ifNull: ['$indices', []] } } },
          date: { $first: '$date' }
        }
      },
      {
        $project: {
          _id: 0,
          date: '$date',
          count: '$count'
        }
      },
      {
        $sort: { date: -1 } // Sort by date descending (newest first)
      }
    ]).toArray();

    res.status(200).json(dates);
  } catch (error) {
    console.error('Error fetching uploaded dates:', error);
    res.status(200).json([]); // Return empty array on error
  }
};

