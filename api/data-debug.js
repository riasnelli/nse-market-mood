const { MongoClient } = require('mongodb');

const handler = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
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

