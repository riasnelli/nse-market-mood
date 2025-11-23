const { getUploadedDataCollection } = require('./lib/mongodb');
const { ObjectId } = require('mongodb');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
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
    // Support both MONGODB_URI and storage_MONGODB_URI (Vercel Storage naming)
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      // MongoDB not configured - return error or fallback to localStorage only
      if (req.method === 'POST') {
        return res.status(200).json({
          success: true,
          message: 'Data saved to localStorage only (MongoDB not configured)',
          warning: 'MONGODB_URI or storage_MONGODB_URI environment variable not set. Data is only stored in browser localStorage.'
        });
      } else if (req.method === 'GET') {
        return res.status(200).json({
          success: true,
          data: [],
          warning: 'MongoDB not configured. Check localStorage for data.'
        });
      } else if (req.method === 'DELETE') {
        return res.status(200).json({
          success: true,
          message: 'MongoDB not configured. Clear data from localStorage.',
          warning: 'MONGODB_URI or storage_MONGODB_URI environment variable not set.'
        });
      }
    }

    const collection = await getUploadedDataCollection();

    if (req.method === 'POST') {
      // Save uploaded data to database
      const { fileName, date, indices, mood, vix, advanceDecline, timestamp, source } = req.body;

      if (!indices || !Array.isArray(indices)) {
        return res.status(400).json({ 
          error: 'Invalid data format',
          message: 'indices must be an array'
        });
      }

      const dataToSave = {
        fileName: fileName || 'uploaded.csv',
        date: date || new Date().toISOString().split('T')[0],
        indices,
        mood: mood || null,
        vix: vix || null,
        advanceDecline: advanceDecline || { advances: 0, declines: 0 },
        timestamp: timestamp || new Date().toISOString(),
        source: source || 'uploaded',
        uploadedAt: new Date(),
        updatedAt: new Date()
      };

      // Insert into MongoDB
      const result = await collection.insertOne(dataToSave);

      console.log(`✅ Data saved to MongoDB: ${result.insertedId}`);

      return res.status(200).json({
        success: true,
        message: 'Data saved successfully to MongoDB',
        id: result.insertedId.toString(),
        data: {
          ...dataToSave,
          _id: result.insertedId.toString()
        }
      });

    } else if (req.method === 'GET') {
      // Retrieve uploaded data from database
      const { id, date } = req.query;

      let query = {};
      
      if (id) {
        // Validate ObjectId format
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ 
            error: 'Invalid ID format',
            message: 'ID must be a valid MongoDB ObjectId'
          });
        }
        query._id = new ObjectId(id);
      }
      
      if (date) {
        query.date = date;
      }

      // Find documents, sort by most recent first
      const documents = await collection
        .find(query)
        .sort({ uploadedAt: -1 })
        .toArray();

      // Format response
      const formattedData = documents.map(doc => ({
        id: doc._id.toString(),
        fileName: doc.fileName,
        date: doc.date,
        indicesCount: doc.indices?.length || 0,
        uploadedAt: doc.uploadedAt,
        mood: doc.mood,
        source: doc.source
      }));

      return res.status(200).json({
        success: true,
        data: formattedData,
        count: formattedData.length
      });

    } else if (req.method === 'DELETE') {
      // Delete uploaded data from database
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ 
          error: 'ID required',
          message: 'Please provide an id query parameter'
        });
      }

      // Validate ObjectId format
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ 
          error: 'Invalid ID format',
          message: 'ID must be a valid MongoDB ObjectId'
        });
      }

      const result = await collection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          error: 'Not found',
          message: `Data with ID ${id} not found`
        });
      }

      console.log(`✅ Data deleted from MongoDB: ${id}`);

      return res.status(200).json({
        success: true,
        message: `Data with ID ${id} deleted successfully`,
        deletedCount: result.deletedCount
      });

    } else {
      return res.status(405).json({ 
        error: 'Method not allowed',
        message: `Method ${req.method} is not supported`
      });
    }
  } catch (error) {
    console.error('❌ Error in save-uploaded-data:', error);
    
    // Provide helpful error messages
    if (error.message.includes('MONGODB_URI')) {
      return res.status(500).json({
        error: 'Database configuration error',
        message: 'MongoDB connection string is not configured. Please set MONGODB_URI environment variable.',
        details: error.message
      });
    }

    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(500).json({
        error: 'Database connection error',
        message: 'Failed to connect to MongoDB. Please check your connection string and network settings.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      type: error.name || 'UnknownError'
    });
  }
};

