const { authMiddleware } = require('./lib/auth');
const { 
  getUploadedDataCollection,
  connectToDatabase
} = require('./lib/mongodb');
const { detectFileType, getCanonicalType } = require('./lib/fileType');

/**
 * Consolidated Admin API Endpoint
 * Handles multiple admin operations via ?action= query parameter
 * 
 * Available actions:
 * - cleanup-types: Clean up database pollution (wrong type in wrong collection)
 * - migrate-signals: Backfill signals for existing uploaded data
 */

// Cleanup Types Handler (from api/admin/cleanup-types.js)
const cleanupTypesHandler = async (req, res) => {
  try {
    const { apply = 'false', days = '30' } = req.query;
    const dryRun = apply !== 'true';
    const daysToScan = parseInt(days, 10) || 30;
    
    console.log(`🔍 Cleanup Types: dryRun=${dryRun}, days=${daysToScan}`);
    
    const { db } = await connectToDatabase();
    
    const collections = {
      indices: 'uploadedIndices',
      bhav: 'uploadedBhav',
      premarket: 'uploadedPreMarket',
      marketactivity: 'uploadedMarketActivity',
      '52w': 'uploadedWeek52'
    };
    
    const report = {
      scanned: 0,
      issues: 0,
      fixed: 0,
      deleted: 0,
      examples: []
    };
    
    // Calculate date threshold
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysToScan);
    const thresholdDateStr = thresholdDate.toISOString().split('T')[0];
    
    for (const [type, collectionName] of Object.entries(collections)) {
      const collection = db.collection(collectionName);
      const expectedType = getCanonicalType(type);
      
      // Find documents in this collection
      const docs = await collection.find({
        uploadedAt: { $gte: thresholdDate }
      }).toArray();
      
      report.scanned += docs.length;
      
      for (const doc of docs) {
        const detectedType = doc.fileName ? detectFileType(doc.fileName) : 'unknown';
        const docType = doc.type || 'unknown';
        
        // Check for mismatches
        const typeMismatch = docType !== expectedType;
        const fileNameMismatch = detectedType !== 'unknown' && detectedType !== docType;
        const collectionMismatch = detectedType !== 'unknown' && detectedType !== expectedType;
        
        if (typeMismatch || fileNameMismatch || collectionMismatch) {
          report.issues++;
          
          const issue = {
            id: doc._id.toString(),
            collection: collectionName,
            fileName: doc.fileName,
            docType: docType,
            expectedType: expectedType,
            detectedType: detectedType,
            date: doc.date
          };
          
          if (report.examples.length < 10) {
            report.examples.push(issue);
          }
          
          if (!dryRun) {
            // Move to correct collection
            const correctCollectionName = collections[detectedType] || collections[expectedType];
            if (correctCollectionName && correctCollectionName !== collectionName) {
              const correctCollection = db.collection(correctCollectionName);
              await correctCollection.insertOne({
                ...doc,
                type: expectedType,
                _migratedAt: new Date()
              });
              await collection.deleteOne({ _id: doc._id });
              report.fixed++;
            } else {
              // Delete if no correct collection found
              await collection.deleteOne({ _id: doc._id });
              report.deleted++;
            }
          }
        }
      }
    }
    
    return res.status(200).json({
      success: true,
      dryRun: dryRun,
      report: report,
      message: dryRun 
        ? `Found ${report.issues} issues (dry run). Use ?apply=true to fix.`
        : `Fixed ${report.fixed} documents, deleted ${report.deleted} documents.`
    });
    
  } catch (error) {
    console.error('❌ Cleanup types error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};

// Migrate Signals Handler (from api/admin/migrate-signals.js)
const migrateSignalsHandler = async (req, res) => {
  try {
    const { apply = 'false', days = '30', strategy = 'momentum_gap' } = req.query;
    const dryRun = apply !== 'true';
    const daysToScan = parseInt(days, 10) || 30;
    
    console.log(`🔍 Migrate Signals: dryRun=${dryRun}, days=${daysToScan}, strategy=${strategy}`);
    
    const { generateSignalsForDate } = require('./lib/signals/generateSignals');
    const { getSignalsStoreCollection } = require('./lib/mongodb');
    const { db } = await connectToDatabase();
    
    // Get dates from uploadedBhav and uploadedPreMarket
    const bhavCollection = db.collection('uploadedBhav');
    const premarketCollection = db.collection('uploadedPreMarket');
    const signalsStoreCollection = await getSignalsStoreCollection();
    
    // Calculate date threshold
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysToScan);
    const thresholdDateStr = thresholdDate.toISOString().split('T')[0];
    
    // Get all dates from bhav and premarket
    const bhavDates = await bhavCollection.distinct('date', {
      date: { $gte: thresholdDateStr }
    });
    const premarketDates = await premarketCollection.distinct('date', {
      date: { $gte: thresholdDateStr }
    });
    
    // Find dates with both bhav and premarket
    const allDates = [...new Set([...bhavDates, ...premarketDates])].sort().reverse();
    const datesWithData = allDates.filter(date => 
      bhavDates.includes(date) && premarketDates.includes(date)
    );
    
    const report = {
      scanned: allDates.length,
      datesWithData: datesWithData.length,
      processed: 0,
      successful: 0,
      errors: 0,
      skipped: 0,
      details: []
    };
    
    for (const date of datesWithData) {
      try {
        // Check if signals already exist
        const existing = await signalsStoreCollection.findOne({ date, strategy });
        
        if (existing && !dryRun) {
          report.skipped++;
          continue;
        }
        
        report.processed++;
        
        if (dryRun) {
          report.details.push({
            date,
            action: 'would generate',
            status: 'pending'
          });
        } else {
          // Generate signals
          const result = await generateSignalsForDate(date, strategy);
          
          if (result && result.status === 'READY') {
            report.successful++;
            report.details.push({
              date,
              action: 'generated',
              status: result.status,
              signalCount: result.signal_count || 0
            });
          } else if (result && result.status === 'NO_MATCH') {
            report.successful++;
            report.details.push({
              date,
              action: 'generated (no match)',
              status: result.status,
              signalCount: 0
            });
          } else {
            report.errors++;
            report.details.push({
              date,
              action: 'failed',
              status: result?.status || 'ERROR',
              error: result?.message || 'Unknown error'
            });
          }
        }
      } catch (error) {
        report.errors++;
        report.details.push({
          date,
          action: 'error',
          status: 'ERROR',
          error: error.message
        });
        console.error(`❌ Error processing ${date}:`, error);
      }
    }
    
    return res.status(200).json({
      success: true,
      dryRun: dryRun,
      strategy: strategy,
      report: report,
      message: dryRun
        ? `Would process ${report.processed} dates. Use ?apply=true to generate signals.`
        : `Processed ${report.processed} dates: ${report.successful} successful, ${report.errors} errors, ${report.skipped} skipped.`
    });
    
  } catch (error) {
    console.error('❌ Migrate signals error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};

// Main handler that routes based on action parameter
const handler = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-app-key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { action } = req.query;
  
  if (!action) {
    return res.status(400).json({ 
      error: 'Action parameter required',
      validActions: ['cleanup-types', 'migrate-signals'],
      usage: 'Use ?action=cleanup-types or ?action=migrate-signals'
    });
  }
  
  switch (action) {
    case 'cleanup-types':
      return await cleanupTypesHandler(req, res);
    case 'migrate-signals':
      return await migrateSignalsHandler(req, res);
    default:
      return res.status(400).json({ 
        error: 'Invalid action',
        validActions: ['cleanup-types', 'migrate-signals'],
        usage: 'Use ?action=cleanup-types or ?action=migrate-signals'
      });
  }
};

// Verify admin authentication
function verifyAdminAuth(req) {
  const appKey = req.headers['x-app-key'];
  const expectedKey = process.env.APP_KEY;
  
  if (!expectedKey) {
    console.warn('⚠️ APP_KEY not set in environment variables');
    return false;
  }
  
  if (!appKey || appKey !== expectedKey) {
    return false;
  }
  
  return true;
}

// Wrap handler with admin auth
const adminHandler = async (req, res) => {
  if (!verifyAdminAuth(req)) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Missing or invalid x-app-key header'
    });
  }
  
  return handler(req, res);
};

module.exports = adminHandler;

