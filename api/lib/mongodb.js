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
    attachDatabasePool(client);
    
    // Connect to MongoDB
    await client.connect();
    
    // Get database name from URI or use default
    // Database name should be in the connection string: mongodb+srv://.../intraq?...
    const url = new URL(uri);
    const dbName = url.pathname.substring(1) || 'intraq'; // Default to 'intraq' if not in URI
    const db = client.db(dbName);

    // Cache the connection
    cachedClient = client;
    cachedDb = db;

    console.log(`✅ Connected to MongoDB Atlas (database: ${dbName})`);
    
    return { client, db };
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Get the uploaded data collection
 */
async function getUploadedDataCollection() {
  const { db } = await connectToDatabase();
  return db.collection('uploadedData');
}

module.exports = {
  connectToDatabase,
  getUploadedDataCollection,
};

