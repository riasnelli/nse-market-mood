const { connectToDatabase } = require('./lib/mongodb');
const { authMiddleware } = require('./lib/auth');

/**
 * API endpoint to flush/delete all CSV uploaded data from MongoDB
 * This will delete all data from:
 * - uploadedIndices
 * - uploadedBhav
 * - uploadedPreMarket
 * - uploadedMarketActivity
 * - uploadedWeek52
 * 
 * NOTE: This does NOT delete data from:
 * - daily_indices (auto-stored from NSE API)
 * - daily_bhavcopy (auto-stored data)
 * - premarket_data (auto-stored data)
 * - signals (generated signals)
 * - signal_runs (signal run metadata)
 * 
 * SECURITY: Requires API key authentication (critical operation)
 */
const handler = async (req, res) => {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST to flush data.'
    });
  }

  try {
    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      return res.status(400).json({
        success: false,
        error: 'MongoDB not configured'
      });
    }

    const { db } = await connectToDatabase();

    // List of all uploaded CSV collections to flush
    const uploadedCollections = [
      'uploadedIndices',
      'uploadedBhav',
      'uploadedPreMarket',
      'uploadedMarketActivity',
      'uploadedWeek52'
    ];

    const results = {};
    let totalDeleted = 0;

    // Delete all documents from each collection
    for (const collectionName of uploadedCollections) {
      try {
        const collection = db.collection(collectionName);
        
        // Count documents before deletion
        const countBefore = await collection.countDocuments({});
        
        // Delete all documents
        const deleteResult = await collection.deleteMany({});
        
        results[collectionName] = {
          deleted: deleteResult.deletedCount || 0,
          existed: countBefore
        };
        
        totalDeleted += deleteResult.deletedCount || 0;
        
        console.log(`✅ Flushed ${collectionName}: ${deleteResult.deletedCount} documents deleted (${countBefore} existed)`);
      } catch (error) {
        console.error(`❌ Error flushing ${collectionName}:`, error.message);
        results[collectionName] = {
          error: error.message,
          deleted: 0,
          existed: 0
        };
      }
    }

    console.log(`🗑️  Total documents deleted: ${totalDeleted}`);

    res.status(200).json({
      success: true,
      message: `Flushed all uploaded CSV data from MongoDB`,
      totalDeleted: totalDeleted,
      collections: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error flushing uploaded data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to flush uploaded data',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = authMiddleware({
  requireAuth: true, // Always require auth for this critical operation
  rateLimitType: 'critical' // Very strict rate limit (5 requests/minute)
})(handler);
