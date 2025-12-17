const { 
  getUploadedDataCollection,
  getDailyBhavcopyCollection,
  getDailyIndicesCollection,
  getPreMarketDataCollection,
  connectToDatabase
} = require('./lib/mongodb');
const { ObjectId } = require('mongodb');
const { authMiddleware } = require('./lib/auth');

const handler = async (req, res) => {
  try {
    // Get action from query params or body
    const action = req.query.action || req.body?.action;
    
    // Validate action
    const validActions = ['save', 'get', 'dates', 'flush'];
    if (action && !validActions.includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action',
        validActions,
        message: `Action must be one of: ${validActions.join(', ')}`
      });
    }

    // Check if MongoDB is configured
    const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
    if (!mongoUri) {
      // MongoDB not configured - return appropriate response based on action
      if (req.method === 'POST' && action === 'save') {
        return res.status(200).json({
          success: true,
          message: 'Data saved to localStorage only (MongoDB not configured)',
          warning: 'MONGODB_URI or storage_MONGODB_URI environment variable not set. Data is only stored in browser localStorage.'
        });
      } else if (req.method === 'GET' && (action === 'get' || !action)) {
        return res.status(200).json({
          success: true,
          data: [],
          warning: 'MongoDB not configured. Check localStorage for data.'
        });
      } else if (req.method === 'GET' && action === 'dates') {
        return res.status(200).json([]);
      } else if (req.method === 'DELETE' && action === 'flush') {
        return res.status(200).json({
          success: true,
          message: 'MongoDB not configured. Clear data from localStorage.',
          warning: 'MONGODB_URI or storage_MONGODB_URI environment variable not set.'
        });
      }
    }

    // Route based on HTTP method and action
    if (req.method === 'POST' && action === 'save') {
      // Save uploaded data to database
      const { fileName, date, indices, mood, vix, advanceDecline, timestamp, source, type } = req.body;

      // Validate type
      const validTypes = ['indices', 'bhav', 'premarket', 'marketactivity', '52w'];
      const uploadType = (type && validTypes.includes(type)) ? type : 'indices';

      if (!indices || !Array.isArray(indices)) {
        return res.status(400).json({ 
          error: 'Invalid data format',
          message: 'indices must be an array'
        });
      }

      // CRITICAL FIX: Always calculate indicesCount from actual array length
      const indicesCount = Array.isArray(indices) ? indices.length : 0;
      
      // For bhavcopy, ensure we have valid EQ stocks
      if (uploadType === 'bhav' && indicesCount === 0) {
        console.warn(`⚠️ WARNING: Bhavcopy upload has 0 indices in array. This means no EQ stocks were processed.`);
        console.warn(`   File: ${fileName}, Date: ${date}`);
        console.warn(`   This file should NOT be saved to database as it has no valid data.`);
      }
      
      const dataToSave = {
        fileName: fileName || 'uploaded.csv',
        date: date || new Date().toISOString().split('T')[0],
        type: uploadType,
        indices: indices || [],
        indicesCount: indicesCount,
        mood: mood || null,
        vix: vix || null,
        advanceDecline: advanceDecline || { advances: 0, declines: 0 },
        timestamp: timestamp || new Date().toISOString(),
        source: source || 'uploaded',
        uploadedAt: new Date(),
        updatedAt: new Date()
      };
      
      // CRITICAL: Double-check indicesCount matches array length
      if (dataToSave.indicesCount !== (dataToSave.indices?.length || 0)) {
        console.warn(`⚠️ Mismatch detected: stored indicesCount=${dataToSave.indicesCount} but array length=${dataToSave.indices?.length || 0}`);
        dataToSave.indicesCount = dataToSave.indices?.length || 0;
        console.log(`✅ Corrected indicesCount to ${dataToSave.indicesCount}`);
      }
      
      console.log(`📊 Saving ${uploadType} data: date=${dataToSave.date}, indicesCount=${indicesCount}, fileName=${fileName}`);
      
      if (uploadType === 'bhav') {
        console.log(`🔍 Bhavcopy data validation:`, {
          indicesArrayLength: indices ? indices.length : 0,
          indicesCount: indicesCount,
          hasIndices: Array.isArray(indices),
          sampleItem: indices && indices.length > 0 ? {
            symbol: indices[0].symbol,
            series: indices[0].series,
            close: indices[0].close,
            hasDate: !!indices[0].date
          } : null
        });
      }

      // Get the correct collection based on type
      const collection = await getUploadedDataCollection(uploadType);

      // CRITICAL: For bhavcopy with 0 count, don't save to database
      if (uploadType === 'bhav' && indicesCount === 0) {
        console.warn(`⚠️ Skipping database save: bhavcopy has 0 processed EQ stocks`);
        console.warn(`   File: ${fileName}, Date: ${date}`);
        return res.status(200).json({
          success: false,
          message: 'Bhavcopy processed 0 EQ stocks - file not saved',
          warning: 'No valid EQ stocks found in file. Check file format and parsing logic.',
          indicesCount: 0,
          skipped: true
        });
      }

      // Insert into MongoDB (metadata)
      const result = await collection.insertOne(dataToSave);

      console.log(`✅ Metadata saved to MongoDB: ${result.insertedId} (type: ${uploadType}, indicesCount: ${indicesCount})`);

      // Also insert individual rows into daily collections
      let dailyInsertCount = 0;
      try {
        if (indices && Array.isArray(indices) && indices.length > 0) {
          const targetDate = date || new Date().toISOString().split('T')[0];
          
          if (uploadType === 'bhav') {
            // Insert into daily_bhavcopy collection
            const bhavcopyCollection = await getDailyBhavcopyCollection();
            
            console.log(`📊 Processing ${indices.length} bhavcopy items for daily collection...`);
            
            // Prepare documents with date field
            const bhavcopyDocs = indices
              .filter(item => item && (item.symbol || item.SYMBOL))
              .map(item => {
                // Use date from item if available, otherwise use targetDate
                const itemDate = item.date || targetDate;
                const symbol = item.symbol || item.SYMBOL || item.Symbol;
                const series = item.series || item.SERIES || 'EQ';
                const close = item.close || item.CLOSE || item.prev_close || item.PREV_CLOSE || item.last_price || item.LAST_PRICE;
                
                return {
                  ...item,
                  date: itemDate,
                  symbol: symbol,
                  series: series,
                  // Normalize field names
                  close: close,
                  high: item.high || item.HIGH || null,
                  low: item.low || item.LOW || null,
                  open: item.open || item.OPEN || null,
                  prevClose: item.prevClose || item.PREVCLOSE || item.prev_close || item.PREV_CLOSE || close,
                  volume: item.volume || item.VOLUME || item.tottrdqty || item.TOTTRDQTY || 0,
                  delivery: item.delivery || item.DELIVERY || item.deliveryqty || item.DELIVERYQTY || 0,
                  delivery_percent: item.delivery_percent || item.DELIVERY_PER || item.delivery_per || 0
                };
              })
              .filter(item => {
                // Only valid entries: must have symbol, series='EQ', and valid close price
                const isValid = item.symbol && 
                               item.series === 'EQ' && 
                               item.close !== null && 
                               item.close !== undefined && 
                               !isNaN(item.close) && 
                               item.close > 0;
                return isValid;
              });
            
            console.log(`📊 Prepared ${bhavcopyDocs.length} valid EQ bhavcopy documents (from ${indices.length} input items)`);
            
            if (bhavcopyDocs.length > 0) {
              // Delete existing data for this date to avoid duplicates
              const deleteResult = await bhavcopyCollection.deleteMany({ date: targetDate, series: 'EQ' });
              console.log(`🗑️ Deleted ${deleteResult.deletedCount} existing bhavcopy records for ${targetDate}`);
              
              // Insert new data
              const insertResult = await bhavcopyCollection.insertMany(bhavcopyDocs, { ordered: false });
              dailyInsertCount = insertResult.insertedCount || bhavcopyDocs.length;
              console.log(`✅ Inserted ${dailyInsertCount} EQ rows into daily_bhavcopy for ${targetDate}`);
              
              if (bhavcopyDocs.length > 0) {
                console.log(`📊 Sample bhavcopy doc:`, {
                  symbol: bhavcopyDocs[0].symbol,
                  series: bhavcopyDocs[0].series,
                  date: bhavcopyDocs[0].date,
                  open: bhavcopyDocs[0].open,
                  high: bhavcopyDocs[0].high,
                  low: bhavcopyDocs[0].low,
                  close: bhavcopyDocs[0].close,
                  prevClose: bhavcopyDocs[0].prevClose
                });
              }
            } else {
              console.warn(`⚠️ No valid bhavcopy documents to insert.`);
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
              
              // Ensure count is set correctly in the metadata document
              if (dataToSave.indicesCount !== dailyInsertCount) {
                dataToSave.indicesCount = dailyInsertCount;
                // Update the document with correct count
                await collection.updateOne(
                  { _id: result.insertedId },
                  { $set: { indicesCount: dailyInsertCount } }
                );
                console.log(`✅ Updated metadata document with correct count: ${dailyInsertCount}`);
              }
            }
          }
        }
      } catch (dailyInsertError) {
        console.error('⚠️ Error inserting into daily collections (metadata saved):', dailyInsertError.message);
        // Don't fail the request - metadata is already saved
      }

      // Summary log
      if (uploadType === 'bhav') {
        console.log(`📊 BHAVCOPY SAVE SUMMARY:`);
        console.log(`   ✅ Metadata saved: ${result.insertedId}`);
        console.log(`   ✅ Daily records: ${dailyInsertCount} EQ stocks`);
        console.log(`   📅 Date: ${dataToSave.date}`);
        console.log(`   📁 File: ${fileName}`);
        console.log(`   📈 Total processed: ${indicesCount} items`);
      }

      return res.status(200).json({
        success: true,
        message: `Data saved successfully to MongoDB${dailyInsertCount > 0 ? ` (${dailyInsertCount} rows inserted into daily collections)` : ''}`,
        id: result.insertedId.toString(),
        dailyInsertCount: dailyInsertCount,
        indicesCount: indicesCount,
        data: {
          ...dataToSave,
          _id: result.insertedId.toString()
        }
      });

    } else if (req.method === 'GET' && action === 'get') {
      // Retrieve uploaded data from database (get-uploaded-data.js logic)
      const { id, date, type, full } = req.query;

      // Check if MongoDB is configured
      const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
      if (!mongoUri) {
        return res.status(404).json({
          error: 'Database not configured',
          message: 'MongoDB is not configured. Please check uploaded data in localStorage.'
        });
      }

      // Allow querying without date/id to get all documents (for listing all files)
      // Only require date/id when action=get is explicitly used with a specific query

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
      let documents = [];
      try {
        if (id) {
          // Single document lookup
          const doc = await collection.findOne(query);
          documents = doc ? [doc] : [];
        } else {
          // Multiple documents
          documents = await collection
            .find(query)
            .sort({ uploadedAt: -1 })
            .toArray();
        }
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

      // If querying by specific date or id and no results, return 404
      // If querying all files and no results, return empty array (like original save-uploaded-data.js)
      if (documents.length === 0) {
        if (date || id) {
          return res.status(404).json({
            error: 'Data not found',
            message: id ? `No data found with ID: ${id}` : `No data found for date: ${date}`
          });
        } else {
          // Querying all files - return empty array
          return res.status(200).json({
            success: true,
            data: [],
            count: 0
          });
        }
      }

      // Return the data in the expected format (matching get-uploaded-data.js)
      // When querying by date (not id), always return the most recent document in single format
      // unless full=true is specified
      // When querying all files (no date/id), return array format
      if (date && !id && !full) {
        // Single document or date query - return in get-uploaded-data format (most recent if multiple)
        const data = documents[0]; // Already sorted by uploadedAt: -1, so [0] is most recent
        return res.status(200).json({
          date: data.date,
          fileName: data.fileName || `Uploaded CSV - ${data.date}`,
          type: data.type || uploadType,
          indices: data.indices || [],
          mood: data.mood || null,
          vix: data.vix || null,
          advanceDecline: data.advanceDecline || { advances: 0, declines: 0 },
          source: 'database'
        });
      } else {
        // Multiple documents or full=true - return in save-uploaded-data GET format
        const formattedData = documents.map(doc => {
          const stocks = 
            Array.isArray(doc.indices) ? doc.indices :
            Array.isArray(doc.records) ? doc.records :
            Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks :
            [];
          
          const actualCount = stocks.length;
          
          return {
            id: doc._id.toString(),
            fileName: doc.fileName,
            date: doc.date,
            indicesCount: actualCount,
            indices: full === 'true' ? stocks : undefined, // Only include if full=true
            uploadedAt: doc.uploadedAt,
            mood: doc.mood,
            source: doc.source
          };
        });

        return res.status(200).json({
          success: true,
          data: formattedData,
          count: formattedData.length
        });
      }

    } else if (req.method === 'GET' && action === 'dates') {
      // Get uploaded dates (get-uploaded-dates.js logic)
      // Check if MongoDB is configured
      const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
      if (!mongoUri) {
        return res.status(200).json([]);
      }

      // Get type from query parameter, default to 'indices'
      const uploadType = req.query.type || 'indices';
      const collection = await getUploadedDataCollection(uploadType);
      
      // Get all documents first to properly count indices
      const allDocuments = await collection
        .find({})
        .sort({ uploadedAt: -1 })
        .toArray();
      
      console.log(`Found ${allDocuments.length} documents for type: ${uploadType}`);
      
      // Group by date and get the most recent file's count for each date
      const dateMap = new Map();
      
      allDocuments.forEach(doc => {
        if (doc.date) {
          const indicesCount = Array.isArray(doc.indices) ? doc.indices.length : 0;
          
          // If date already exists, keep the one with more indices (or most recent)
          if (!dateMap.has(doc.date) || indicesCount > (dateMap.get(doc.date).count || 0)) {
            dateMap.set(doc.date, {
              date: doc.date,
              count: indicesCount,
              type: uploadType
            });
          }
        }
      });
      
      // Convert to array and sort by date descending
      const dates = Array.from(dateMap.values()).sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      });

      res.status(200).json(dates);

    } else if (req.method === 'DELETE') {
      // Handle DELETE: either single document deletion (by id) or flush (action=flush)
      const { id, type } = req.query;
      
      // Check if MongoDB is configured
      const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
      if (!mongoUri) {
        return res.status(400).json({
          success: false,
          error: 'MongoDB not configured'
        });
      }

      if (action === 'flush') {
        // Flush uploaded data (flush-uploaded-data.js logic)
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
      } else if (id) {
        // Delete single document by ID (save-uploaded-data.js DELETE logic)
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

        // Get type from query parameter, default to 'indices'
        const uploadType = type || 'indices';
        const collection = await getUploadedDataCollection(uploadType);

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
        return res.status(400).json({
          error: 'Invalid DELETE request',
          message: 'DELETE requires either id parameter (for single deletion) or action=flush (for bulk flush)'
        });
      }

    } else if (req.method === 'GET' && !action) {
      // Default GET behavior - same as action='get' but without requiring action param
      // This maintains backward compatibility
      const { id, date, type, full } = req.query;

      // Check if MongoDB is configured
      const mongoUri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
      if (!mongoUri) {
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
      if (full === 'true') {
        // Return full data including indices array
        const fullData = documents.map(doc => {
          const stocks = 
            Array.isArray(doc.indices) ? doc.indices :
            Array.isArray(doc.records) ? doc.records :
            Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks :
            [];
          
          return {
            id: doc._id.toString(),
            fileName: doc.fileName,
            date: doc.date,
            indices: stocks,
            indicesCount: stocks.length,
            mood: doc.mood,
            vix: doc.vix,
            advanceDecline: doc.advanceDecline,
            uploadedAt: doc.uploadedAt,
            source: doc.source
          };
        });

        return res.status(200).json({
          success: true,
          data: fullData,
          count: fullData.length
        });
      } else {
        // Return metadata only (default)
        const formattedData = documents.map(doc => {
          const stocks = 
            Array.isArray(doc.indices) ? doc.indices :
            Array.isArray(doc.records) ? doc.records :
            Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks :
            [];
          
          const actualCount = stocks.length;
          
          return {
            id: doc._id.toString(),
            fileName: doc.fileName,
            date: doc.date,
            indicesCount: actualCount,
            indices: stocks,
            uploadedAt: doc.uploadedAt,
            mood: doc.mood,
            source: doc.source
          };
        });

        return res.status(200).json({
          success: true,
          data: formattedData,
          count: formattedData.length
        });
      }

    } else {
      // Method not allowed
      return res.status(405).json({ 
        error: 'Method not allowed',
        message: `Method ${req.method} is not supported for this endpoint`,
        allowed: ['GET', 'POST', 'DELETE']
      });
    }
  } catch (error) {
    console.error('❌ Error in data endpoint:', error);
    
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

module.exports = authMiddleware({
  requireAuth: req => {
    // Require auth for POST (save) and DELETE (flush)
    const action = req.query.action || req.body?.action;
    return req.method === 'POST' || (req.method === 'DELETE' && action === 'flush');
  },
  rateLimitType: req => {
    const action = req.query.action || req.body?.action;
    if (req.method === 'DELETE' && action === 'flush') return 'critical';
    if (req.method === 'POST' && action === 'save') return 'write';
    return 'public';
  }
})(handler);

