const { MongoClient } = require('mongodb');
const { attachDatabasePool } = require('@vercel/functions');

// MongoDB connection caching for serverless functions
let cachedClient = null;
let cachedDb = null;

/**
 * Connect to MongoDB Atlas
 * Uses Vercel's attachDatabasePool for optimal serverless function handling
 */
async function connectToDatabase() {
  // Return cached connection if available
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Get MongoDB URI from environment variable
  // Support both MONGODB_URI and storage_MONGODB_URI (Vercel Storage naming)
  const uri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
  
  if (!uri) {
    throw new Error('MONGODB_URI or storage_MONGODB_URI environment variable is not set');
  }

  // Create MongoDB client with optimized options for serverless
  const client = new MongoClient(uri, {
    appName: 'nse-market-mood',
    maxIdleTimeMS: 5000, // Close idle connections after 5 seconds
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  });

  try {
    // Attach the client to Vercel's database pool for proper cleanup
    // Note: attachDatabasePool might not be available in all Vercel environments
    try {
      attachDatabasePool(client);
    } catch (attachError) {
      console.warn('⚠️ attachDatabasePool not available, continuing without it:', attachError.message);
    }
    
    // Connect to MongoDB with timeout
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('MongoDB connection timeout after 10 seconds')), 10000)
      )
    ]);
    
    // Get database name from URI or use default
    // Database name should be in the connection string: mongodb+srv://.../intraq?...
    const url = new URL(uri);
    const dbName = url.pathname.substring(1) || 'intraq'; // Default to 'intraq' if not in URI
    const db = client.db(dbName);

    // Cache the connection
    cachedClient = client;
    cachedDb = db;

    console.log(`✅ Connected to MongoDB Atlas (database: ${dbName})`);
    
    // Initialize collections and indexes
    await initializeCollections(db);
    
    return { client, db };
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Initialize collections and indexes
 * Ensures required collections exist with proper indexes
 */
async function initializeCollections(db) {
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    // Ensure eod_candidates collection exists
    if (!collectionNames.includes('eod_candidates')) {
      await db.createCollection('eod_candidates');
      console.log('✅ Created eod_candidates collection');
    }
    
    // Ensure index on date field for eod_candidates (creates index if it doesn't exist)
    try {
      await db.collection('eod_candidates').createIndex({ date: 1 }, { background: true });
      console.log('✅ Created index on eod_candidates.date');
    } catch (indexError) {
      // Index might already exist, ignore the error
      if (!indexError.message.includes('already exists')) {
        console.warn('⚠️ Warning creating index on eod_candidates.date:', indexError.message);
      }
    }
    
    // Ensure other important collections exist (optional, they'll be created on first insert)
    const requiredCollections = [
      'signal_candidates',
      'active_signals',
      'rejected_candidates'
    ];
    
    for (const collName of requiredCollections) {
      if (!collectionNames.includes(collName)) {
        await db.createCollection(collName);
        console.log(`✅ Created ${collName} collection`);
      }
    }
    
    // Create indexes for signal_candidates
    try {
      await db.collection('signal_candidates').createIndex({ tradingDay: 1, strategyId: 1 }, { background: true });
      await db.collection('signal_candidates').createIndex({ createdAt: -1 }, { background: true });
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️ Warning creating indexes on signal_candidates:', err.message);
      }
    }
    
    // Create indexes for active_signals
    try {
      await db.collection('active_signals').createIndex({ premarketDate: 1, strategyId: 1 }, { background: true });
      await db.collection('active_signals').createIndex({ createdAt: -1 }, { background: true });
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('⚠️ Warning creating indexes on active_signals:', err.message);
      }
    }
    
  } catch (error) {
    // Don't fail connection if collection initialization fails
    console.warn('⚠️ Warning during collection initialization:', error.message);
  }
}

/**
 * Get the uploaded data collection based on type
 * @param {string} type - 'indices', 'bhav', or 'premarket'
 */
async function getUploadedDataCollection(type = 'indices') {
  const { db } = await connectToDatabase();
  
  // Map type to collection name (canonical mapping)
  const collectionMap = {
    'indices': 'uploadedIndices',
    'bhav': 'uploadedBhav',
    'premarket': 'uploadedPreMarket',
    'marketactivity': 'uploadedMarketActivity',
    '52w': 'uploadedWeek52'
  };
  
  const collectionName = collectionMap[type] || 'uploadedIndices';
  return db.collection(collectionName);
}

/**
 * Get all uploaded data collections (for listing all types)
 */
async function getAllUploadedDataCollections() {
  const { db } = await connectToDatabase();
  return {
    indices: db.collection('uploadedIndices'),
    bhav: db.collection('uploadedBhav'),
    premarket: db.collection('uploadedPreMarket')
  };
}

/**
 * Get signal candidates collection
 * Stores candidates generated in Phase 1 (after market close)
 */
async function getSignalCandidatesCollection() {
  const { db } = await connectToDatabase();
  return db.collection('signal_candidates');
}

/**
 * Get active signals collection
 * Stores activated signals from Phase 2 (after premarket confirmation)
 */
async function getActiveSignalsCollection() {
  const { db } = await connectToDatabase();
  return db.collection('active_signals');
}

/**
 * Get EOD candidates collection
 * Stores EOD watchlist candidates for future premarket validation
 * Used as a cache to avoid regenerating candidates every time
 */
async function getEODCandidatesCollection() {
  const { db } = await connectToDatabase();
  return db.collection('eod_candidates');
}

/**
 * Get daily indices collection
 */
async function getDailyIndicesCollection() {
  const { db } = await connectToDatabase();
  return db.collection('daily_indices');
}

/**
 * Get daily bhavcopy collection
 */
async function getDailyBhavcopyCollection() {
  const { db } = await connectToDatabase();
  return db.collection('daily_bhavcopy');
}

/**
 * Get premarket data collection
 */
async function getPreMarketDataCollection() {
  const { db } = await connectToDatabase();
  return db.collection('premarket_data');
}

/**
 * Get signal collection
 */
async function getSignalCollection() {
  const { db } = await connectToDatabase();
  return db.collection('signals');
}

/**
 * Get signal run collection
 */
async function getSignalRunCollection() {
  const { db } = await connectToDatabase();
  return db.collection('signal_runs');
}

/**
 * Get signals store collection
 * This is the new unified collection for storing signal generation results with status
 */
async function getSignalsStoreCollection() {
  const { db } = await connectToDatabase();
  return db.collection('signals_store');
}

module.exports = {
  connectToDatabase,
  getUploadedDataCollection,
  getAllUploadedDataCollections,
  getDailyIndicesCollection,
  getDailyBhavcopyCollection,
  getPreMarketDataCollection,
  getSignalCollection,
  getSignalRunCollection,
  getSignalsStoreCollection,
  getSignalCandidatesCollection,
  getActiveSignalsCollection,
  getEODCandidatesCollection,
};

