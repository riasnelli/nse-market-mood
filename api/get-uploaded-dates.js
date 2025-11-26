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
    
    // Get all documents first to properly count indices
    const allDocuments = await collection
      .find({})
      .sort({ uploadedAt: -1 })
      .toArray();
    
    // Group by date and get the most recent file's count for each date
    const dateMap = new Map();
    
    allDocuments.forEach(doc => {
      if (doc.date) {
        const indicesCount = Array.isArray(doc.indices) ? doc.indices.length : 0;
        
        // If date already exists, keep the one with more indices (or most recent)
        if (!dateMap.has(doc.date) || indicesCount > (dateMap.get(doc.date).count || 0)) {
          dateMap.set(doc.date, {
            date: doc.date,
            count: indicesCount
          });
        }
      }
    });
    
    // Convert to array and sort by date descending
    const dates = Array.from(dateMap.values()).sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });

    res.status(200).json(dates);
  } catch (error) {
    console.error('Error fetching uploaded dates:', error);
    res.status(200).json([]); // Return empty array on error
  }
};

