const { 
  getUploadedDataCollection,
  getDailyBhavcopyCollection,
  getDailyIndicesCollection,
  getPreMarketDataCollection,
  connectToDatabase
} = require('./lib/mongodb');
const { ObjectId } = require('mongodb');
const { authMiddleware } = require('./lib/auth');
const { validateFileType, detectFileType, parseDateFromFilename, getCanonicalType } = require('./lib/fileType');
const { generateSignalsForDate } = require('./lib/signals/generateSignals');

const handler = async (req, res) => {
  // Set Content-Type header early to ensure JSON responses
  res.setHeader('Content-Type', 'application/json');
  // Version: ba8d7b3 - All critical bugs fixed, chunked uploads implemented
  
  // Wrap entire handler in try-catch to catch any crashes
  try {
    // Early validation: Check request size for POST requests
    if (req.method === 'POST') {
      const contentLength = req.headers['content-length'];
      if (contentLength) {
        const sizeMB = parseInt(contentLength) / (1024 * 1024);
        // Vercel has ~4.5MB request body limit for serverless functions
        if (sizeMB > 4) {
          console.warn(`⚠️ Request too large: ${sizeMB.toFixed(2)}MB`);
          return res.status(200).json({
            success: false,
            error: 'Request too large',
            message: `Request body is ${sizeMB.toFixed(2)}MB which exceeds Vercel's limit (~4.5MB). The file has too many rows. Please split the file or contact support.`,
            sizeMB: sizeMB.toFixed(2),
            maxSizeMB: 4.5
          });
        }
      }
    }
    
    // Get action from query params or body
    const action = req.query.action || req.body?.action;
    
    // Validate action
    const validActions = ['save', 'get', 'dates', 'flush', 'check'];
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
      // Support chunked uploads: chunkIndex, totalChunks, and data array
      const { fileName, date, indices: indicesOld, data, mood, vix, advanceDecline, timestamp, source, type, _originalCount, _isLargeFile, chunkIndex, totalChunks } = req.body;
      
      // Support both 'indices' (old format) and 'data' (new chunked format)
      const dataArray = data || indicesOld || [];

      // STRICT FILE TYPE DETECTION: Single source of truth
      if (!fileName) {
        return res.status(400).json({
          success: false,
          error: 'File name required',
          message: 'fileName is required for file type detection'
        });
      }

      // Detect type from filename (canonical source)
      const detectedType = detectFileType(fileName);
      if (detectedType === 'unknown') {
        return res.status(400).json({
          success: false,
          error: 'Unknown file type',
          message: `Cannot determine file type from filename: ${fileName}. Please use a recognized filename pattern.`,
          detectedType: 'unknown'
        });
      }

      // Normalize user-provided type
      const userType = getCanonicalType(type || 'indices');
      
      // STRICT VALIDATION: User-selected type MUST match detected type
      if (userType !== detectedType) {
        console.error(`❌ File type mismatch: detected="${detectedType}", user-selected="${userType}", fileName="${fileName}"`);
        return res.status(400).json({
          success: false,
          error: 'File type mismatch',
          message: `File type mismatch: filename suggests "${detectedType}" but you selected "${userType}". Please verify the file type.`,
          detectedType,
          expectedType: userType,
          fileName
        });
      }

      // Use detected type (canonical)
      const uploadType = detectedType;
      console.log(`✅ File type validated: ${fileName} -> ${uploadType}`);

      // Parse tradeDate from filename (preferred) or use provided date
      let tradeDateFromFilename = null;
      try {
        tradeDateFromFilename = parseDateFromFilename(fileName);
      } catch (error) {
        console.error(`❌ Error parsing date from filename "${fileName}":`, error.message);
        // If filename parsing fails, show error to user
        return res.status(400).json({
          success: false,
          error: 'Invalid filename date format',
          message: `Cannot extract date from filename "${fileName}". ${error.message}. Please ensure the filename contains a valid date in DDMMYYYY format (e.g., CM_52_wk_High_low_22122025.csv).`
        });
      }
      
      let tradeDate = tradeDateFromFilename || date || new Date().toISOString().split('T')[0];
      
      // Validate and normalize date format (must be YYYY-MM-DD)
      if (tradeDate) {
        // Extract just the date part (YYYY-MM-DD) if it includes time
        const dateOnly = tradeDate.toString().split('T')[0].split(' ')[0].trim();
        // Validate format
        if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Validate date is actually valid (not 2025-20-25)
          const [year, month, day] = dateOnly.split('-').map(Number);
          if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            tradeDate = dateOnly;
          } else {
            console.warn(`⚠️ Invalid date values: ${dateOnly}, using provided date or today`);
            tradeDate = date || new Date().toISOString().split('T')[0];
          }
        } else {
          console.warn(`⚠️ Invalid date format: ${tradeDate}, using provided date or today`);
          tradeDate = date || new Date().toISOString().split('T')[0];
        }
      }
      
      // Final validation - if still invalid, return error (don't silently use today)
      if (!tradeDate || !tradeDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format',
          message: `Invalid date format: "${tradeDate}". Expected YYYY-MM-DD format. Please provide a valid date.`
        });
      }
      
      // Final validation of date values
      const [year, month, day] = tradeDate.split('-').map(Number);
      if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date values',
          message: `Invalid date values: ${tradeDate} (year=${year}, month=${month}, day=${day}). Year must be 2000-2100, month 1-12, day 1-31.`
        });
      }
      
      console.log(`📅 Date validation: filename="${fileName}", parsed="${tradeDateFromFilename}", provided="${date}", final="${tradeDate}"`);
      
      // Runtime assertion: ensure type is valid
      const validTypes = ['indices', 'bhav', 'premarket', 'marketactivity', '52w'];
      if (!validTypes.includes(uploadType)) {
        console.error(`❌ Invalid type after detection: ${uploadType}`);
        return res.status(500).json({
          success: false,
          error: 'Internal error',
          message: `Invalid type detected: ${uploadType}`
        });
      }
      
      if (!dataArray || !Array.isArray(dataArray)) {
        return res.status(400).json({ 
          error: 'Invalid data format',
          message: 'data or indices must be an array'
        });
      }
      
      // For chunked uploads, validate chunk size
      const MAX_CHUNK_SIZE = 500;
      if (dataArray.length > MAX_CHUNK_SIZE) {
        return res.status(413).json({
          success: false,
          error: 'Chunk too large',
          message: `Chunk contains ${dataArray.length} rows. Maximum ${MAX_CHUNK_SIZE} rows per request.`,
          suggestion: 'Split data into smaller chunks on client side'
        });
      }
      
      // Log chunk info if present
      if (chunkIndex !== undefined && totalChunks !== undefined) {
        console.log(`📦 Processing chunk ${chunkIndex}/${totalChunks} for ${fileName || 'upload'}`);
      }
      
      // Use dataArray as indices throughout
      const indices = dataArray;
      
      // CRITICAL FIX: Always calculate rowCount from actual array length
      // For large files, frontend may send limited array but provide _originalCount
      // Use _originalCount if provided, otherwise use array length
      const rowCount = Array.isArray(indices) ? indices.length : 0;
      const finalRowCount = _originalCount || rowCount;
      const isLargeFileFlag = _isLargeFile || false;
      
      if (isLargeFileFlag && _originalCount) {
        console.log(`⚠️ Large file: ${_originalCount} total rows, but only ${rowCount} sent in request`);
        console.log(`   Using original count ${_originalCount} for metadata, but only ${rowCount} rows will be saved to daily collection`);
      }
      
      // For chunked uploads, we need to handle metadata differently
      // Only update metadata on the last chunk
      const isLastChunk = chunkIndex === undefined || chunkIndex === totalChunks;
      
      // For bhavcopy, ensure we have valid EQ stocks
      if (uploadType === 'bhav' && finalRowCount === 0) {
        console.warn(`⚠️ WARNING: Bhavcopy upload has 0 rows. This means no EQ stocks were processed.`);
        console.warn(`   File: ${fileName}, Date: ${tradeDate}`);
        console.warn(`   This file should NOT be saved to database as it has no valid data.`);
      }
      
      // Runtime assertion: ensure rowCount matches array length (unless it's a large file)
      const actualArrayLength = Array.isArray(indices) ? indices.length : 0;
      if (!isLargeFileFlag && finalRowCount !== actualArrayLength) {
        console.error(`❌ CRITICAL: rowCount mismatch: ${finalRowCount} vs array length ${actualArrayLength}`);
        // Use actual array length as source of truth
        const correctedRowCount = actualArrayLength;
        console.log(`✅ Corrected rowCount to ${correctedRowCount}`);
      }
      
      // Check data size before saving (MongoDB has 16MB document limit)
      // Estimate size: each row ~500 bytes, plus metadata ~1KB
      // Use finalRowCount (which includes _originalCount for large files)
      const estimatedSize = (finalRowCount * 500) + 1000; // bytes
      const maxSize = 15 * 1024 * 1024; // 15MB (leave 1MB buffer)
      const isLargeFileBySize = estimatedSize > maxSize || isLargeFileFlag;
      
      if (isLargeFileBySize) {
        console.warn(`⚠️ Large file detected: ${estimatedSize} bytes (estimated), max: ${maxSize} bytes`);
        console.warn(`   Will store metadata only, data will be in daily collection`);
      }

      // For large files, don't store all rows in metadata document
      // Store only a sample or empty array - actual data goes to daily collection
      // NOTE: maxRowsInMetadata only affects the indices array stored in metadata
      // The rowCount field always stores the ACTUAL total count of all rows
      const maxRowsInMetadata = 100; // Store max 100 rows in metadata for small files (for preview only)
      const indicesForMetadata = isLargeFileBySize ? [] : (indices || []).slice(0, maxRowsInMetadata);

      const dataToSave = {
        fileName: fileName,
        date: tradeDate, // Use tradeDate (from filename or provided)
        tradeDate: tradeDate, // Explicit tradeDate field
        type: uploadType, // Canonical type from detection
        indices: indicesForMetadata, // Only store sample for large files (for preview only)
        // CRITICAL: Both indicesCount and rowCount must reflect the ACTUAL total count
        // NOT the sliced metadata array length (which is capped at 100)
        indicesCount: finalRowCount, // Use finalRowCount (actual total, not metadata array length)
        rowCount: finalRowCount, // Use finalRowCount (includes _originalCount for large files)
        mood: mood || null,
        vix: vix || null,
        advanceDecline: advanceDecline || { advances: 0, declines: 0 },
        timestamp: timestamp || new Date().toISOString(),
        source: source || 'uploaded',
        uploadedAt: new Date(),
        updatedAt: new Date(),
        _largeFile: isLargeFileBySize // Flag to indicate data is in daily collection
      };
      
      // Runtime assertion: ensure type matches collection
      const collectionMap = {
        'indices': 'uploadedIndices',
        'bhav': 'uploadedBhav',
        'premarket': 'uploadedPreMarket',
        'marketactivity': 'uploadedMarketActivity',
        '52w': 'uploadedWeek52'
      };
      const expectedCollection = collectionMap[uploadType];
      if (!expectedCollection) {
        console.error(`❌ CRITICAL: No collection mapping for type: ${uploadType}`);
        return res.status(500).json({
          success: false,
          error: 'Internal error',
          message: `No collection mapping for type: ${uploadType}`
        });
      }

      console.log(`📊 Saving ${uploadType} data: tradeDate=${tradeDate}, rowCount=${rowCount}, fileName=${fileName}, type=${uploadType}`);
      
      if (uploadType === 'bhav') {
        console.log(`🔍 Bhavcopy data validation:`, {
          indicesArrayLength: indices ? indices.length : 0,
          indicesCount: finalRowCount,
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
      
      // Runtime assertion: verify collection name matches expected
      const actualCollectionName = collection.collectionName;
      if (actualCollectionName !== expectedCollection) {
        console.error(`❌ CRITICAL: Collection mismatch! Expected: ${expectedCollection}, Got: ${actualCollectionName}`);
        return res.status(500).json({
          success: false,
          error: 'Internal error',
          message: `Collection mismatch: expected ${expectedCollection}, got ${actualCollectionName}`
        });
      }

      // CRITICAL: For bhavcopy with 0 count, don't save to database
      if (uploadType === 'bhav' && rowCount === 0) {
        console.warn(`⚠️ Skipping database save: bhavcopy has 0 processed EQ stocks`);
        console.warn(`   File: ${fileName}, Date: ${tradeDate}`);
        return res.status(200).json({
          success: false,
          message: 'Bhavcopy processed 0 EQ stocks - file not saved',
          warning: 'No valid EQ stocks found in file. Check file format and parsing logic.',
          rowCount: 0,
          indicesCount: 0,
          skipped: true
        });
      }

      // CRITICAL: For premarket with 0 count, don't save to database
      if (uploadType === 'premarket' && rowCount === 0) {
        console.warn(`⚠️ Skipping database save: premarket has 0 processed rows`);
        console.warn(`   File: ${fileName}, Date: ${tradeDate}`);
        return res.status(200).json({
          success: false,
          message: 'Premarket processed 0 rows - file not saved',
          warning: 'No valid premarket data found in file. Check file format and parsing logic.',
          rowCount: 0,
          indicesCount: 0,
          skipped: true
        });
      }

      // Check for existing file with same fileName and tradeDate to prevent duplicates
      const existingFile = await collection.findOne({ 
        fileName: fileName, 
        tradeDate: tradeDate,
        type: uploadType 
      });

      let result;
      let documentId;
      let isDuplicate = false;
      
      if (existingFile) {
        // File already exists - update it instead of creating duplicate
        console.log(`⚠️ File already exists: ${fileName} (${tradeDate}). Updating existing record...`);
        console.log(`   Old values: rowCount=${existingFile.rowCount}, indicesCount=${existingFile.indicesCount}`);
        console.log(`   New values: rowCount=${dataToSave.rowCount}, indicesCount=${dataToSave.indicesCount}`);
        result = await collection.updateOne(
          { _id: existingFile._id },
          { 
            $set: {
              ...dataToSave,
              updatedAt: new Date()
            }
          }
        );
        documentId = existingFile._id;
        isDuplicate = true;
        console.log(`✅ Updated existing file record: ${documentId} (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);
        
        // Verify the update actually changed the rowCount
        const updatedDoc = await collection.findOne({ _id: existingFile._id });
        if (updatedDoc) {
          console.log(`   Verified update: rowCount=${updatedDoc.rowCount}, indicesCount=${updatedDoc.indicesCount}`);
        }
      } else {
        // New file - insert it
        result = await collection.insertOne(dataToSave);
        documentId = result.insertedId;
        console.log(`✅ New file inserted: ${documentId}`);
      }

      console.log(`✅ Metadata ${isDuplicate ? 'updated' : 'saved'} to MongoDB: ${documentId} (type: ${uploadType}, rowCount: ${rowCount}, tradeDate: ${tradeDate}, collection: ${actualCollectionName})`);

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
                  { _id: documentId },
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
        console.log(`   ✅ Metadata ${isDuplicate ? 'updated' : 'saved'}: ${documentId}`);
        console.log(`   ✅ Daily records: ${dailyInsertCount} EQ stocks`);
        console.log(`   📅 Date: ${dataToSave.date}`);
        console.log(`   📁 File: ${fileName}`);
        console.log(`   📈 Total processed: ${finalRowCount} items`);
      }

      // TRIGGER SIGNAL GENERATION: After successful upload, check if we can generate signals
      // Only generate for bhav or premarket uploads (required for momentum_gap strategy)
      let signalGenerationTriggered = false;
      if ((uploadType === 'bhav' || uploadType === 'premarket') && dataToSave.date) {
        try {
          console.log(`🔄 Triggering signal generation check for date: ${dataToSave.date}`);
          // Check if both bhav and premarket are now available for this date
          // If yes, generate signals; if no, signals_store will have INSUFFICIENT_DATA status
          // Note: For bhav uploads, we need yesterday's bhav + today's premarket
          // For premarket uploads, we need today's premarket + yesterday's bhav
          // Keep it simple: generate for the upload date (strategy will handle date logic internally)
          await generateSignalsForDate(dataToSave.date, 'momentum_gap');
          signalGenerationTriggered = true;
          console.log(`✅ Signal generation triggered for ${dataToSave.date}`);
        } catch (signalError) {
          console.error('⚠️ Error triggering signal generation (non-fatal):', signalError.message);
          // Don't fail the upload if signal generation fails
        }
      }

      return res.status(200).json({
        success: true,
        message: isDuplicate 
          ? `File already existed - updated successfully${dailyInsertCount > 0 ? ` (${dailyInsertCount} rows updated in daily collections)` : ''}${signalGenerationTriggered ? ' (signal generation triggered)' : ''}`
          : `Data saved successfully to MongoDB${dailyInsertCount > 0 ? ` (${dailyInsertCount} rows inserted into daily collections)` : ''}${signalGenerationTriggered ? ' (signal generation triggered)' : ''}`,
        id: documentId.toString(),
        isDuplicate: isDuplicate,
        dailyInsertCount: dailyInsertCount,
        indicesCount: finalRowCount,
        signalGenerationTriggered: signalGenerationTriggered,
        data: {
          ...dataToSave,
          _id: documentId.toString()
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
        console.error(`❌ Error querying collection ${uploadType}:`, error);
        console.error('Query:', query);
        console.error('Error stack:', error.stack);
        // Return 200 with error info instead of 500, so frontend can handle gracefully
        return res.status(200).json({
          success: false,
          data: [],
          count: 0,
          error: error.message,
          errorType: error.name || 'UnknownError'
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
        
        // If metadata has fewer rows than total, fetch from daily collection
        let indices = data.indices || [];
        const metadataCount = indices.length;
        const totalRowCount = data.rowCount || data.indicesCount || metadataCount;
        
        if (totalRowCount > metadataCount) {
          try {
            const { getDailyIndicesCollection, getDailyBhavcopyCollection, getPreMarketDataCollection } = require('./lib/mongodb');
            let dailyCollection;
            
            if (uploadType === 'bhav') {
              dailyCollection = await getDailyBhavcopyCollection();
              const dailyDocs = await dailyCollection.find({ 
                date: data.date || data.tradeDate,
                fileName: data.fileName 
              }).toArray();
              if (dailyDocs.length > 0) {
                indices = dailyDocs;
                console.log(`📊 Fetched ${dailyDocs.length} rows from daily_bhavcopy for ${data.fileName}`);
              }
            } else if (uploadType === 'premarket') {
              dailyCollection = await getPreMarketDataCollection();
              const dailyDocs = await dailyCollection.find({ 
                date: data.date || data.tradeDate,
                fileName: data.fileName 
              }).toArray();
              if (dailyDocs.length > 0) {
                indices = dailyDocs;
                console.log(`📊 Fetched ${dailyDocs.length} rows from premarket_data for ${data.fileName}`);
              }
            } else if (uploadType === 'indices') {
              dailyCollection = await getDailyIndicesCollection();
              const dailyDocs = await dailyCollection.find({ 
                date: data.date || data.tradeDate,
                fileName: data.fileName 
              }).toArray();
              if (dailyDocs.length > 0) {
                indices = dailyDocs;
                console.log(`📊 Fetched ${dailyDocs.length} rows from daily_indices for ${data.fileName}`);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Error fetching from daily collection for ${data.fileName}:`, error.message);
            // Continue with metadata rows if daily fetch fails
          }
        }
        
        return res.status(200).json({
          date: data.date,
          fileName: data.fileName || `Uploaded CSV - ${data.date}`,
          type: data.type || uploadType,
          indices: indices,
          mood: data.mood || null,
          vix: data.vix || null,
          advanceDecline: data.advanceDecline || { advances: 0, declines: 0 },
          source: 'database'
        });
      } else {
        // Multiple documents or full=true - return in save-uploaded-data GET format
        // When querying all files (no date/id), aggregate counts by date to handle chunked uploads
        if (!date && !id) {
          // Aggregate by date to sum counts from multiple chunks
          console.log(`📊 Aggregating documents by date for type: ${uploadType}`);
          
          try {
            // Build valid query for aggregation (only filter invalid dates, no date/id specific filters)
            const aggregationMatch = {
              date: {
                $regex: /^\d{4}-\d{2}-\d{2}$/,
                $exists: true,
                $ne: null,
                $type: 'string'
              }
            };
            
            // Use MongoDB aggregation to group by date and sum counts
            const aggregatedData = await collection.aggregate([
              // Filter out invalid dates (e.g., "2212-20-25")
              { $match: aggregationMatch },
              // Sort by uploadedAt descending to get most recent document first in each group
              { $sort: { uploadedAt: -1 } },
              {
                $group: {
                  _id: '$date',
                  // CRITICAL: Sum rowCount from all chunks (this is the primary count field)
                  totalRowCount: {
                    $sum: {
                      $ifNull: ['$rowCount', 0]
                    }
                  },
                  // Also sum indicesCount (for backward compatibility with old documents)
                  totalIndicesCount: {
                    $sum: {
                      $ifNull: ['$indicesCount', 0]
                    }
                  },
                  // Keep the most recent document for metadata (first after sort)
                  latestDoc: { $first: '$$ROOT' },
                  // Keep the latest uploadedAt for display
                  latestUploadedAt: { $max: '$uploadedAt' },
                  // Count how many chunks
                  chunkCount: { $sum: 1 }
                }
              },
              {
                $sort: { latestUploadedAt: -1 }
              }
            ]).toArray();

            console.log(`📊 Aggregated ${aggregatedData.length} unique dates from collection ${collection.collectionName}`);
            
            // Debug: Log aggregation results for first few dates
            aggregatedData.slice(0, 5).forEach(agg => {
              console.log(`🔍 Aggregation result for ${agg._id}: totalRowCount=${agg.totalRowCount}, totalIndicesCount=${agg.totalIndicesCount}, chunkCount=${agg.chunkCount}`);
              if (agg.latestDoc) {
                console.log(`   Latest doc: rowCount=${agg.latestDoc.rowCount}, indicesCount=${agg.latestDoc.indicesCount}, fileName=${agg.latestDoc.fileName}, uploadedAt=${agg.latestDoc.uploadedAt}`);
              }
            });
            
            // Debug: Log all documents for dates with suspicious counts (e.g., exactly 100)
            aggregatedData.forEach(agg => {
              if (agg.totalRowCount === 100 || agg.totalIndicesCount === 100) {
                console.warn(`⚠️ Suspicious count of 100 for date ${agg._id}: totalRowCount=${agg.totalRowCount}, totalIndicesCount=${agg.totalIndicesCount}, chunkCount=${agg.chunkCount}`);
                if (agg.latestDoc) {
                  console.warn(`   Latest doc details: rowCount=${agg.latestDoc.rowCount}, indicesCount=${agg.latestDoc.indicesCount}, fileName=${agg.latestDoc.fileName}, uploadedAt=${agg.latestDoc.uploadedAt}`);
                }
              }
            });

            const formattedData = await Promise.all(aggregatedData.map(async (agg) => {
              const doc = agg.latestDoc;
              // CRITICAL: Use the aggregated sum, prefer totalRowCount (sum of rowCount from all chunks)
              // Fall back to totalIndicesCount for backward compatibility
              // This ensures we get the correct sum across all chunks for the same date
              let aggregatedCount = agg.totalRowCount > 0 
                ? agg.totalRowCount 
                : (agg.totalIndicesCount > 0 ? agg.totalIndicesCount : 0);
              
              // HACK: If count is suspicious (100 for indices, 0 for 52w when file exists), fetch actual count from daily collection
              if (uploadType === 'indices' && aggregatedCount === 100) {
                try {
                  const { getDailyIndicesCollection } = require('./lib/mongodb');
                  const dailyCollection = await getDailyIndicesCollection();
                  const actualCount = await dailyCollection.countDocuments({ date: agg._id });
                  if (actualCount > 0 && actualCount !== 100) {
                    console.log(`⚠️ HACK: Correcting indices count from 100 to ${actualCount} for date ${agg._id}`);
                    aggregatedCount = actualCount;
                  }
                } catch (err) {
                  console.warn(`⚠️ Could not fetch daily_indices count for ${agg._id}:`, err.message);
                }
              } else if (uploadType === '52w' && aggregatedCount === 0 && doc.fileName && doc.fileName !== 'Unknown') {
                // For 52W, if count is 0 but file exists, try counting from metadata array or check if it's a parsing issue
                // Note: 52W doesn't use daily collection, data is only in metadata
                // If file exists but count is 0, it means parsing failed - count stays 0
                console.warn(`⚠️ 52W file exists but count is 0 for date ${agg._id}, fileName: ${doc.fileName}`);
              }
              
              // Debug log for dates with multiple chunks to verify aggregation
              if (agg.chunkCount > 1) {
                console.log(`📊 Date ${agg._id}: ${agg.chunkCount} chunks, aggregated count=${aggregatedCount} (totalRowCount=${agg.totalRowCount}, totalIndicesCount=${agg.totalIndicesCount})`);
              }
              
              // For display, use the latest document's fileName and other metadata
              let stocks = 
                Array.isArray(doc.indices) ? doc.indices :
                Array.isArray(doc.records) ? doc.records :
                Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks :
                [];
              
              const metadataCount = stocks.length;
              
              // If we need full data, fetch from daily collection using the aggregated count
              if (full === 'true' && aggregatedCount > metadataCount) {
                try {
                  const { getDailyIndicesCollection, getDailyBhavcopyCollection, getPreMarketDataCollection } = require('./lib/mongodb');
                  let dailyCollection;
                  
                  if (uploadType === 'bhav') {
                    dailyCollection = await getDailyBhavcopyCollection();
                    const dailyDocs = await dailyCollection.find({ 
                      date: agg._id
                    }).toArray();
                    if (dailyDocs.length > 0) {
                      stocks = dailyDocs;
                      console.log(`📊 Fetched ${dailyDocs.length} rows from daily_bhavcopy for date ${agg._id}`);
                    }
                  } else if (uploadType === 'premarket') {
                    dailyCollection = await getPreMarketDataCollection();
                    const dailyDocs = await dailyCollection.find({ 
                      date: agg._id
                    }).toArray();
                    if (dailyDocs.length > 0) {
                      stocks = dailyDocs;
                      console.log(`📊 Fetched ${dailyDocs.length} rows from premarket_data for date ${agg._id}`);
                    }
                  } else if (uploadType === 'indices') {
                    dailyCollection = await getDailyIndicesCollection();
                    const dailyDocs = await dailyCollection.find({ 
                      date: agg._id
                    }).toArray();
                    if (dailyDocs.length > 0) {
                      stocks = dailyDocs;
                      console.log(`📊 Fetched ${dailyDocs.length} rows from daily_indices for date ${agg._id}`);
                    }
                  }
                } catch (error) {
                  console.warn(`⚠️ Error fetching from daily collection for date ${agg._id}:`, error.message);
                  // Continue with metadata rows if daily fetch fails
                }
              }
              
              return {
                id: doc._id.toString(),
                fileName: doc.fileName || 'Unknown',
                date: agg._id,
                type: doc.type || uploadType,
                indicesCount: aggregatedCount, // Use aggregated sum (sum of all chunks)
                rowCount: aggregatedCount, // Use aggregated sum (sum of all chunks)
                count: aggregatedCount, // Also include 'count' field for backward compatibility
                totalCount: aggregatedCount, // Explicit totalCount field for frontend
                indices: full === 'true' ? stocks : undefined,
                uploadedAt: agg.latestUploadedAt || doc.uploadedAt,
                updatedAt: doc.updatedAt || agg.latestUploadedAt || doc.uploadedAt,
                mood: doc.mood || null,
                source: doc.source || 'uploaded',
                _chunkCount: agg.chunkCount // Debug info
              };
            }));

            const totalChunks = aggregatedData.reduce((sum, agg) => sum + (agg.chunkCount || 1), 0);
            console.log(`✅ Returning ${formattedData.length} aggregated entries (summed ${totalChunks} total chunks)`);
            
            return res.status(200).json({
              success: true,
              data: formattedData,
              count: formattedData.length
            });
          } catch (aggError) {
            console.error('❌ Error during aggregation, falling back to individual documents:', aggError);
            console.error('Aggregation error details:', {
              message: aggError.message,
              stack: aggError.stack,
              name: aggError.name,
              uploadType: uploadType
            });
            
            // Check if it's a connection error - if so, return error response
            if (aggError.name === 'MongoServerError' || aggError.name === 'MongoNetworkError' || aggError.name === 'MongoTimeoutError') {
              console.error('❌ MongoDB connection error during aggregation');
              return res.status(200).json({
                success: false,
                data: [],
                count: 0,
                error: 'Database connection error',
                errorType: aggError.name || 'DatabaseError',
                message: 'Failed to connect to MongoDB during aggregation. Please check your connection settings.'
              });
            }
            
            // For other aggregation errors, fall through to original logic
            // Documents are already fetched, so we can use them
          }
        }
        
        // Fallback: Original logic for specific date/id queries or if aggregation fails
        // Note: documents should already be populated from earlier query
        if (!documents || documents.length === 0) {
          // If documents weren't fetched yet (shouldn't happen, but safety check)
          try {
            documents = await collection
              .find(query)
              .sort({ uploadedAt: -1 })
              .toArray();
              
            // Filter invalid dates
            documents = documents.filter(doc => {
              if (!doc.date) return false;
              const dateStr = String(doc.date);
              const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
              if (!dateMatch) return false;
              const [, year, month, day] = dateMatch.map(Number);
              return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
            });
          } catch (error) {
            console.error('❌ Error fetching documents in fallback:', error);
            return res.status(200).json({
              success: false,
              data: [],
              count: 0,
              error: error.message || 'Failed to fetch documents',
              errorType: error.name || 'UnknownError'
            });
          }
        }
        
        const formattedData = await Promise.all(documents.map(async (doc) => {
          let stocks = 
            Array.isArray(doc.indices) ? doc.indices :
            Array.isArray(doc.records) ? doc.records :
            Array.isArray(doc.normalized?.stocks) ? doc.normalized.stocks :
            [];
          
          const metadataCount = stocks.length;
          const totalRowCount = doc.rowCount || doc.indicesCount || metadataCount;
          
          // If metadata has fewer rows than total, fetch from daily collection
          if (totalRowCount > metadataCount && (full === 'true' || metadataCount < totalRowCount)) {
            try {
              const { getDailyIndicesCollection, getDailyBhavcopyCollection, getPreMarketDataCollection } = require('./lib/mongodb');
              let dailyCollection;
              
              if (uploadType === 'bhav') {
                dailyCollection = await getDailyBhavcopyCollection();
                const dailyDocs = await dailyCollection.find({ 
                  date: doc.date || doc.tradeDate,
                  fileName: doc.fileName 
                }).toArray();
                if (dailyDocs.length > 0) {
                  stocks = dailyDocs;
                  console.log(`📊 Fetched ${dailyDocs.length} rows from daily_bhavcopy for ${doc.fileName}`);
                }
              } else if (uploadType === 'premarket') {
                dailyCollection = await getPreMarketDataCollection();
                const dailyDocs = await dailyCollection.find({ 
                  date: doc.date || doc.tradeDate,
                  fileName: doc.fileName 
                }).toArray();
                if (dailyDocs.length > 0) {
                  stocks = dailyDocs;
                  console.log(`📊 Fetched ${dailyDocs.length} rows from premarket_data for ${doc.fileName}`);
                }
              } else if (uploadType === 'indices') {
                dailyCollection = await getDailyIndicesCollection();
                const dailyDocs = await dailyCollection.find({ 
                  date: doc.date || doc.tradeDate,
                  fileName: doc.fileName 
                }).toArray();
                if (dailyDocs.length > 0) {
                  stocks = dailyDocs;
                  console.log(`📊 Fetched ${dailyDocs.length} rows from daily_indices for ${doc.fileName}`);
                }
              }
            } catch (error) {
              console.warn(`⚠️ Error fetching from daily collection for ${doc.fileName}:`, error.message);
              // Continue with metadata rows if daily fetch fails
            }
          }
          
          const actualCount = stocks.length;
          
          return {
            id: doc._id.toString(),
            fileName: doc.fileName,
            date: doc.date,
            type: doc.type || uploadType, // CRITICAL: Include type field for frontend validation
            indicesCount: actualCount,
            rowCount: totalRowCount, // Use total rowCount from metadata
            indices: full === 'true' ? stocks : undefined, // Only include if full=true
            uploadedAt: doc.uploadedAt,
            updatedAt: doc.updatedAt,
            mood: doc.mood,
            source: doc.source
          };
        }));

        return res.status(200).json({
          success: true,
          data: formattedData,
          count: formattedData.length
        });
      }

    } else if (req.method === 'GET' && action === 'check') {
      // Check date data availability (check-date-data.js logic)
      const { date } = req.query;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          error: 'Date parameter is required',
          message: 'Please provide a date query parameter (YYYY-MM-DD)'
        });
      }

      const { 
        getDailyBhavcopyCollection, 
        getDailyIndicesCollection, 
        getPreMarketDataCollection,
        getSignalCollection,
        getSignalRunCollection,
        getUploadedDataCollection
      } = require('./lib/mongodb');

      function getYesterdayDate(todayDate) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - 1);
        while (d.getDay() === 0 || d.getDay() === 6) {
          d.setDate(d.getDate() - 1);
        }
        return d.toISOString().split('T')[0];
      }

      try {
        const yesterdayDate = getYesterdayDate(date);
        const bhavcopyCollection = await getDailyBhavcopyCollection();
        const indicesCollection = await getDailyIndicesCollection();
        const premarketCollection = await getPreMarketDataCollection();
        const signalCollection = await getSignalCollection();
        const signalRunCollection = await getSignalRunCollection();
        const uploadedBhavCollection = await getUploadedDataCollection('bhav');
        const uploadedPremarketCollection = await getUploadedDataCollection('premarket');

        let bhavcopyCount = await bhavcopyCollection.countDocuments({ date: yesterdayDate, series: 'EQ' });
        if (bhavcopyCount === 0) {
          const uploadedBhavDocs = await uploadedBhavCollection.find({ date: yesterdayDate }).toArray();
          for (const doc of uploadedBhavDocs) {
            if (doc.indices && Array.isArray(doc.indices)) {
              bhavcopyCount += doc.indices.filter(item => !item.series || item.series === 'EQ').length;
            }
          }
        }

        let indicesCount = await indicesCollection.countDocuments({ date: date });
        if (indicesCount === 0) {
          indicesCount = await indicesCollection.countDocuments({ date: yesterdayDate });
        }

        let premarketCount = await premarketCollection.countDocuments({ date: date });
        if (premarketCount === 0) {
          const uploadedPremarketDocs = await uploadedPremarketCollection.find({ date: date }).toArray();
          for (const doc of uploadedPremarketDocs) {
            if (doc.indices && Array.isArray(doc.indices)) {
              premarketCount += doc.indices.length;
            }
          }
        }

        const signalRun = await signalRunCollection.findOne({ date: date });
        let signalsCount = 0;
        if (signalRun && signalRun.run_id) {
          signalsCount = await signalCollection.countDocuments({ run_id: signalRun.run_id });
        }

        const signalRuns = await signalRunCollection.find({ date: date }).sort({ created_at: -1 }).toArray();

        const hasBhav = bhavcopyCount > 0;
        const hasIndices = indicesCount > 0;
        const hasPremarket = premarketCount > 0;
        const hasSignals = signalsCount > 0;
        const canGenerateSignals = hasBhav && hasPremarket;

        return res.status(200).json({
          success: true,
          date: date,
          canGenerateSignals: canGenerateSignals,
          data: {
            bhavcopy: { available: hasBhav, count: bhavcopyCount },
            indices: { available: hasIndices, count: indicesCount },
            premarket: { available: hasPremarket, count: premarketCount },
            signals: { available: hasSignals, count: signalsCount },
            signalRuns: { count: signalRuns.length, runs: signalRuns.map(r => ({ run_id: r.run_id, regime_code: r.regime_code, strategies_used: r.strategies_used })) }
          },
          hasBhav: hasBhav,
          hasPremarket: hasPremarket,
          hasIndices: hasIndices,
          message: canGenerateSignals 
            ? `Data available for ${date}. Signals can be generated.`
            : `Incomplete data for ${date}. Need bhavcopy and premarket to generate signals.`
        });
      } catch (error) {
        console.error('Error checking date data:', error);
        return res.status(200).json({
          success: false,
          date: date,
          canGenerateSignals: false,
          data: {
            bhavcopy: { available: false, count: 0 },
            indices: { available: false, count: 0 },
            premarket: { available: false, count: 0 },
            signals: { available: false, count: 0 },
            signalRuns: { count: 0, runs: [] }
          },
          hasBhav: false,
          hasPremarket: false,
          hasIndices: false,
          error: error.message
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
        // Filter out invalid dates in the query (backup to aggregation filter)
        const validQuery = { ...query };
        if (!validQuery.date && !validQuery._id) {
          // Only filter invalid dates if we're not querying by a specific date or ID
          validQuery.date = {
            $regex: /^\d{4}-\d{2}-\d{2}$/,
            $exists: true,
            $ne: null
          };
        }
        
        documents = await collection
          .find(validQuery)
          .sort({ uploadedAt: -1 })
          .toArray();
          
        // Additional client-side filter for invalid dates (backup)
        documents = documents.filter(doc => {
          if (!doc.date) return false;
          const dateStr = String(doc.date);
          const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!dateMatch) return false;
          const [, year, month, day] = dateMatch.map(Number);
          // Validate date ranges
          return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
        });
      } catch (error) {
        console.error(`❌ Error querying collection ${uploadType}:`, error);
        console.error('Query:', JSON.stringify(query, null, 2));
        console.error('Error stack:', error.stack);
        console.error('Error name:', error.name);
        
        // Check if it's a connection error
        if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
          console.error('❌ MongoDB connection error - returning empty data');
          return res.status(200).json({
            success: false,
            data: [],
            count: 0,
            error: 'Database connection error',
            errorType: error.name || 'DatabaseError',
            message: 'Failed to connect to MongoDB. Please check your connection settings.'
          });
        }
        
        // Return 200 with error info instead of 500, so frontend can handle gracefully
        return res.status(200).json({
          success: false,
          data: [],
          count: 0,
          error: error.message || 'Unknown error occurred',
          errorType: error.name || 'UnknownError'
        });
      }
      
      console.log(`Found ${documents.length} valid documents for type: ${uploadType} (after filtering invalid dates)`);

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
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Ensure we haven't already sent a response
    if (res.headersSent) {
      console.error('⚠️ Response already sent, cannot send error response');
      return;
    }
    
    // Ensure Content-Type is set to JSON
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json');
    }
    
    // Provide helpful error messages
    if (error.message && error.message.includes('MONGODB_URI')) {
      return res.status(200).json({
        success: false,
        error: 'Database configuration error',
        message: 'MongoDB connection string is not configured. Please set MONGODB_URI environment variable.',
        details: error.message
      });
    }

    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
      return res.status(200).json({
        success: false,
        error: 'Database connection error',
        message: 'Failed to connect to MongoDB. Please check your connection string and network settings.',
        errorType: error.name || 'DatabaseError',
        details: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }

    // For GET requests, try to return 200 with error info instead of 500
    // This allows frontend to show a helpful message instead of just failing
    if (req.method === 'GET' && (req.query.action === 'get' || !req.query.action)) {
      return res.status(200).json({
        success: false,
        data: [],
        count: 0,
        error: error.message || 'Unknown error occurred',
        errorType: error.name || 'UnknownError'
      });
    }

    // For POST and other methods, also return 200 with error info
    return res.status(200).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred',
      errorType: error.name || 'UnknownError',
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
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

