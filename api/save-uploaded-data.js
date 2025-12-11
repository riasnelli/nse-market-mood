const { 
  getUploadedDataCollection,
  getDailyBhavcopyCollection,
  getDailyIndicesCollection,
  getPreMarketDataCollection
} = require('./lib/mongodb');
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


    if (req.method === 'POST') {
      // Save uploaded data to database
      const { fileName, date, indices, mood, vix, advanceDecline, timestamp, source, type } = req.body;

      // Validate type
      const validTypes = ['indices', 'bhav', 'premarket'];
      const uploadType = (type && validTypes.includes(type)) ? type : 'indices';

      if (!indices || !Array.isArray(indices)) {
        return res.status(400).json({ 
          error: 'Invalid data format',
          message: 'indices must be an array'
        });
      }

      // Calculate indicesCount from the indices array length
      const indicesCount = Array.isArray(indices) ? indices.length : 0;
      
      const dataToSave = {
        fileName: fileName || 'uploaded.csv',
        date: date || new Date().toISOString().split('T')[0],
        type: uploadType,
        indices,
        indicesCount: indicesCount, // Explicitly store the count
        mood: mood || null,
        vix: vix || null,
        advanceDecline: advanceDecline || { advances: 0, declines: 0 },
        timestamp: timestamp || new Date().toISOString(),
        source: source || 'uploaded',
        uploadedAt: new Date(),
        updatedAt: new Date()
      };
      
      console.log(`📊 Saving ${uploadType} data: date=${dataToSave.date}, indicesCount=${indicesCount}, fileName=${fileName}`);

      // Get the correct collection based on type
      const collection = await getUploadedDataCollection(uploadType);

      // Insert into MongoDB (metadata)
      const result = await collection.insertOne(dataToSave);

      console.log(`✅ Data saved to MongoDB: ${result.insertedId}`);

      // Also insert individual rows into daily collections
      let dailyInsertCount = 0;
      try {
        if (indices && Array.isArray(indices) && indices.length > 0) {
          const targetDate = date || new Date().toISOString().split('T')[0];
          
          if (uploadType === 'bhav') {
            // Insert into daily_bhavcopy collection
            const bhavcopyCollection = await getDailyBhavcopyCollection();
            
            // Prepare documents with date field
            const bhavcopyDocs = indices
              .filter(item => item && (item.symbol || item.SYMBOL))
              .map(item => ({
                ...item,
                date: targetDate,
                symbol: item.symbol || item.SYMBOL || item.Symbol,
                series: item.series || item.SERIES || 'EQ',
                // Normalize field names
                close: item.close || item.CLOSE || item.prev_close || item.PREV_CLOSE || item.last_price || item.LAST_PRICE,
                high: item.high || item.HIGH,
                low: item.low || item.LOW,
                open: item.open || item.OPEN,
                volume: item.volume || item.VOLUME || item.tottrdqty || item.TOTTRDQTY || 0,
                delivery: item.delivery || item.DELIVERY || item.deliveryqty || item.DELIVERYQTY || 0,
                delivery_percent: item.delivery_percent || item.DELIVERY_PER || item.delivery_per || 0
              }))
              .filter(item => item.symbol && item.close > 0); // Only valid entries
            
            if (bhavcopyDocs.length > 0) {
              // Delete existing data for this date to avoid duplicates
              await bhavcopyCollection.deleteMany({ date: targetDate, series: 'EQ' });
              
              // Insert new data
              const insertResult = await bhavcopyCollection.insertMany(bhavcopyDocs, { ordered: false });
              dailyInsertCount = insertResult.insertedCount || bhavcopyDocs.length;
              console.log(`✅ Inserted ${dailyInsertCount} rows into daily_bhavcopy for ${targetDate}`);
              console.log(`📊 DEBUG: Sample bhavcopy doc:`, JSON.stringify(bhavcopyDocs[0], null, 2));
            } else {
              console.warn(`⚠️ No valid bhavcopy documents to insert. Filtered ${indices.length} items, got ${bhavcopyDocs.length} valid docs.`);
              console.warn(`   Sample item before filtering:`, indices[0] ? JSON.stringify(indices[0], null, 2) : 'No items in indices array');
            }
          } else if (uploadType === 'indices') {
            // Insert into daily_indices collection
            const indicesCollection = await getDailyIndicesCollection();
            
            // Prepare documents with date field
            const indicesDocs = indices
              .filter(item => item && (item.symbol || item.SYMBOL))
              .map(item => ({
                ...item,
                date: targetDate,
                symbol: item.symbol || item.SYMBOL || item.Symbol,
                last_price: item.last_price || item.LAST_PRICE || item.lastPrice || item.close || item.CLOSE,
                pChange: item.pChange || item.PCHANGE || item.p_change || item.change_percent || 0
              }))
              .filter(item => item.symbol && item.last_price > 0); // Only valid entries
            
            if (indicesDocs.length > 0) {
              // Delete existing data for this date to avoid duplicates
              await indicesCollection.deleteMany({ date: targetDate });
              
              // Insert new data
              const insertResult = await indicesCollection.insertMany(indicesDocs, { ordered: false });
              dailyInsertCount = insertResult.insertedCount || indicesDocs.length;
              console.log(`✅ Inserted ${dailyInsertCount} rows into daily_indices for ${targetDate}`);
            }
          } else if (uploadType === 'premarket') {
            // Insert into premarket_data collection
            const premarketCollection = await getPreMarketDataCollection();
            
            // Prepare documents with date field
            const premarketDocs = indices
              .filter(item => item && (item.symbol || item.SYMBOL))
              .map(item => ({
                ...item,
                date: targetDate,
                symbol: item.symbol || item.SYMBOL || item.Symbol,
                pre_open_price: item.pre_open_price || item.PRE_OPEN_PRICE || item.preOpenPrice || 
                              item.price || item.PRICE || item.last_price || item.LAST_PRICE ||
                              item.close || item.CLOSE || item.ltp || item.LTP || 0,
                price: item.pre_open_price || item.PRE_OPEN_PRICE || item.preOpenPrice || 
                       item.price || item.PRICE || item.last_price || item.LAST_PRICE ||
                       item.close || item.CLOSE || item.ltp || item.LTP || 0
              }))
              .filter(item => item.symbol && (item.pre_open_price > 0 || item.price > 0)); // Only valid entries
            
            if (premarketDocs.length > 0) {
              // Delete existing data for this date to avoid duplicates
              await premarketCollection.deleteMany({ date: targetDate });
              
              // Insert new data
              const insertResult = await premarketCollection.insertMany(premarketDocs, { ordered: false });
              dailyInsertCount = insertResult.insertedCount || premarketDocs.length;
              console.log(`✅ Inserted ${dailyInsertCount} rows into premarket_data for ${targetDate}`);
              console.log(`📊 DEBUG: Sample premarket doc:`, JSON.stringify(premarketDocs[0], null, 2));
            } else {
              console.warn(`⚠️ No valid premarket documents to insert. Filtered ${indices.length} items, got ${premarketDocs.length} valid docs.`);
              console.warn(`   Sample item before filtering:`, indices[0] ? JSON.stringify(indices[0], null, 2) : 'No items in indices array');
            }
          }
        }
      } catch (dailyInsertError) {
        console.error('⚠️ Error inserting into daily collections (metadata saved):', dailyInsertError.message);
        // Don't fail the request - metadata is already saved
      }

      return res.status(200).json({
        success: true,
        message: `Data saved successfully to MongoDB${dailyInsertCount > 0 ? ` (${dailyInsertCount} rows inserted into daily collections)` : ''}`,
        id: result.insertedId.toString(),
        dailyInsertCount: dailyInsertCount,
        data: {
          ...dataToSave,
          _id: result.insertedId.toString()
        }
      });

    } else if (req.method === 'GET') {
      // Retrieve uploaded data from database
      const { id, date, type } = req.query;

      // Check if MongoDB is configured
      const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
      if (!mongoUri) {
        // MongoDB not configured - return empty array
        return res.status(200).json({
          success: true,
          data: [],
          count: 0,
          message: 'MongoDB not configured. No uploaded data available.'
        });
      }

      // Get type from query parameter, default to 'indices'
      const uploadType = type || 'indices';
      
      // Get the correct collection based on type
      let collection;
      try {
        collection = await getUploadedDataCollection(uploadType);
      } catch (error) {
        console.error('Error getting collection:', error);
        return res.status(200).json({
          success: false,
          data: [],
          count: 0,
          error: error.message
        });
      }

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
      // No limit - fetch all documents to show all dates including last week
      let documents = [];
      try {
        documents = await collection
          .find(query)
          .sort({ uploadedAt: -1 })
          .toArray();
      } catch (error) {
        console.error('Error querying collection:', error);
        return res.status(200).json({
          success: false,
          data: [],
          count: 0,
          error: error.message
        });
      }
      
      console.log(`Found ${documents.length} documents for type: ${uploadType}`);

      // Check if full data is requested (for loading into UI)
      const { full } = req.query;
      
      if (full === 'true') {
        // Return full data including indices array
        const fullData = documents.map(doc => ({
          id: doc._id.toString(),
          fileName: doc.fileName,
          date: doc.date,
          indices: doc.indices || [],
          indicesCount: doc.indices?.length || 0,
          mood: doc.mood,
          vix: doc.vix,
          advanceDecline: doc.advanceDecline,
          uploadedAt: doc.uploadedAt,
          source: doc.source
        }));

        return res.status(200).json({
          success: true,
          data: fullData,
          count: fullData.length
        });
      } else {
        // Return metadata only (default)
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
      }

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

