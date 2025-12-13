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
      const validTypes = ['indices', 'bhav', 'premarket', 'marketactivity', '52w'];
      const uploadType = (type && validTypes.includes(type)) ? type : 'indices';

      if (!indices || !Array.isArray(indices)) {
        return res.status(400).json({ 
          error: 'Invalid data format',
          message: 'indices must be an array'
        });
      }

      // CRITICAL FIX: Always calculate indicesCount from actual array length
      // Don't trust the frontend's indicesCount - recalculate it
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
        indices: indices || [], // Always ensure it's an array
        indicesCount: indicesCount, // Calculated from actual array length
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
              console.warn(`   Input items: ${indices.length}`);
              console.warn(`   Valid docs after filtering: ${bhavcopyDocs.length}`);
              if (indices.length > 0) {
                console.warn(`   Sample input item:`, {
                  symbol: indices[0].symbol,
                  series: indices[0].series,
                  close: indices[0].close,
                  hasDate: !!indices[0].date
                });
              } else {
                console.warn(`   No items in indices array`);
              }
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
        const fullData = documents.map(doc => {
          // CRITICAL: Always read from indices array, check multiple possible field names
          const stocks = 
            Array.isArray(doc.indices) ? doc.indices :
            Array.isArray(doc.records) ? doc.records :
            Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks :
            [];
          
          return {
            id: doc._id.toString(),
            fileName: doc.fileName,
            date: doc.date,
            indices: stocks, // Always return the actual array
            indicesCount: stocks.length, // Always calculate from array
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
          // CRITICAL FIX: Always calculate indicesCount from actual array, not stored value
          // Check multiple possible field names for bhavcopy data
          const stocks = 
            Array.isArray(doc.indices) ? doc.indices :
            Array.isArray(doc.records) ? doc.records :
            Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks :
            [];
          
          // Calculate count from actual array length
          const actualCount = stocks.length;
          
          // Debug log for bhavcopy documents
          if (doc.type === 'bhav' && (doc.date === '2025-12-11' || doc.date === '2025-12-10' || doc.date === '2025-12-01')) {
            console.log(`🔍 Bhavcopy document debug for ${doc.date}:`, {
              docId: doc._id.toString(),
              fileName: doc.fileName,
              keys: Object.keys(doc),
              indicesType: typeof doc.indices,
              isIndicesArray: Array.isArray(doc.indices),
              indicesLength: Array.isArray(doc.indices) ? doc.indices.length : 'N/A',
              recordsType: typeof doc.records,
              isRecordsArray: Array.isArray(doc.records),
              recordsLength: Array.isArray(doc.records) ? doc.records.length : 'N/A',
              normalizedType: typeof doc.normalized,
              normalizedStocks: Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks.length : 'N/A',
              storedIndicesCount: doc.indicesCount,
              actualCountFromArray: actualCount,
              stocksArrayLength: stocks.length,
              sampleStocks: stocks.length > 0 ? stocks.slice(0, 2) : null
            });
          }
          
          return {
            id: doc._id.toString(),
            fileName: doc.fileName,
            date: doc.date,
            indicesCount: actualCount, // Always use calculated count from array
            indices: stocks, // Include the actual array for frontend to check
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

