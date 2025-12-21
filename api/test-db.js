/**
 * Simple test endpoint to verify MongoDB connection
 * GET /api/test-db - Tests database connectivity
 */
const { connectToDatabase } = require('./lib/mongodb');

const handler = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Testing MongoDB connection...');
    
    // Check if MongoDB URI is set
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      return res.status(200).json({
        success: false,
        error: 'MongoDB URI not configured',
        message: 'MONGODB_URI or storage_MONGODB_URI environment variable is not set',
        hasUri: false
      });
    }

    console.log('✅ MongoDB URI found, attempting connection...');
    
    // Try to connect
    const { db } = await connectToDatabase();
    console.log('✅ Connected to database:', db.databaseName);

    // Try a simple query to verify connection works
    const collections = await db.listCollections().toArray();
    console.log('✅ Found collections:', collections.map(c => c.name));

    // Try to query one collection
    let testResult = null;
    try {
      const testCollection = db.collection('uploadedIndices');
      const count = await testCollection.countDocuments();
      testResult = { collection: 'uploadedIndices', count };
      console.log(`✅ Test query successful: ${count} documents in uploadedIndices`);
    } catch (queryError) {
      console.warn('⚠️ Test query failed (collection might not exist):', queryError.message);
      testResult = { error: queryError.message };
    }

    return res.status(200).json({
      success: true,
      message: 'MongoDB connection successful',
      database: db.databaseName,
      hasUri: true,
      collections: collections.map(c => c.name),
      testQuery: testResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error);
    return res.status(200).json({
      success: false,
      error: error.message,
      errorType: error.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = handler;

