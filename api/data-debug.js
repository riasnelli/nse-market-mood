const { MongoClient } = require('mongodb');
const { connectToDatabase } = require('./lib/mongodb');

const handler = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Support multiple debug operations via query parameter
  const operation = req.query.operation || 'diagnostics'; // 'diagnostics' or 'test-db'
  
  if (operation === 'test-db') {
    // Test database connection (from test-db.js)
    try {
      console.log('🔍 Testing MongoDB connection...');
      
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
      
      const { db } = await connectToDatabase();
      console.log('✅ Connected to database:', db.databaseName);

      const collections = await db.listCollections().toArray();
      console.log('✅ Found collections:', collections.map(c => c.name));

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
  }

  // Default: Full diagnostics (from data-debug.js)
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {},
    mongodb: {},
    request: {}
  };

  try {
    // Set Content-Type header
    res.setHeader('Content-Type', 'application/json');

    // Check environment variables
    diagnostics.environment = {
      hasMongoUri: !!process.env.MONGODB_URI,
      hasStorageMongoUri: !!process.env.storage_MONGODB_URI,
      mongoUriPrefix: (process.env.MONGODB_URI || process.env.storage_MONGODB_URI || '').substring(0, 30) + '...',
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV
    };

    // Check request
    diagnostics.request = {
      method: req.method,
      query: req.query,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      headers: {
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']?.substring(0, 50)
      }
    };

    // Try MongoDB connection
    try {
      const uri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
      
      if (!uri) {
        diagnostics.mongodb = {
          connected: false,
          error: 'MONGODB_URI or storage_MONGODB_URI not set'
        };
        return res.status(200).json({
          success: false,
          error: 'MongoDB URI not configured',
          diagnostics
        });
      }

      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000
      });
      
      await client.connect();
      const db = client.db('intraq');
      
      // List collections
      const collections = await db.listCollections().toArray();
      
      // Test a simple query on each collection
      const collectionTests = {};
      for (const col of collections) {
        try {
          const count = await db.collection(col.name).countDocuments({}, { limit: 1 });
          collectionTests[col.name] = { exists: true, hasData: count > 0 };
        } catch (err) {
          collectionTests[col.name] = { exists: true, error: err.message };
        }
      }
      
      diagnostics.mongodb = {
        connected: true,
        database: 'intraq',
        collections: collections.map(c => c.name),
        collectionTests: collectionTests
      };
      
      await client.close();
      
      return res.status(200).json({
        success: true,
        diagnostics
      });

    } catch (error) {
      diagnostics.mongodb = {
        connected: false,
        error: error.message,
        errorType: error.constructor.name,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      };
      
      return res.status(200).json({
        success: false,
        error: 'MongoDB connection failed',
        diagnostics
      });
    }

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      diagnostics
    });
  }
};

module.exports = handler;

