/**
 * Admin Cleanup Endpoint
 * 
 * POST /api/admin/cleanup-types
 * 
 * Scans for records where record.type does not match collection or inferred type from filename.
 * Outputs a report and optionally fixes by moving documents to correct collection or deleting duplicates.
 * 
 * Requires: x-app-key header matching APP_KEY environment variable
 * 
 * Query params:
 * - dry_run=true (default) - Only report issues, don't fix
 * - apply=true - Actually fix issues (move/delete records)
 * - days=N - Scan last N days (default: 30, use 0 for all)
 */

const { connectToDatabase, getUploadedDataCollection } = require('../lib/mongodb');
const { detectFileType } = require('../lib/fileType');
const { authMiddleware } = require('../lib/auth');

/**
 * Verify admin authentication (APP_KEY header)
 */
function verifyAdminAuth(req) {
  const appKey = req.headers['x-app-key'];
  const validAppKey = process.env.APP_KEY;
  
  if (!validAppKey) {
    console.warn('⚠️ APP_KEY not configured in environment');
    return false;
  }
  
  return appKey === validAppKey;
}

/**
 * Map type to collection name
 */
function getCollectionNameForType(type) {
  const map = {
    'indices': 'uploadedIndices',
    'bhav': 'uploadedBhav',
    'premarket': 'uploadedPreMarket',
    'marketactivity': 'uploadedMarketActivity',
    '52w': 'uploadedWeek52'
  };
  return map[type] || null;
}

const handler = async (req, res) => {
  try {
    // Admin auth check
    if (!verifyAdminAuth(req)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Admin authentication required. Provide x-app-key header matching APP_KEY.'
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'Method not allowed',
        message: `Method ${req.method} is not supported`,
        allowed: ['POST']
      });
    }

    const dryRun = req.query.dry_run !== 'false'; // Default to true
    const apply = req.query.apply === 'true';
    const days = parseInt(req.query.days || '30', 10);

    console.log(`🔍 [cleanup-types] Starting scan: dry_run=${dryRun}, apply=${apply}, days=${days}`);

    const { db } = await connectToDatabase();

    // All uploaded collections
    const allCollections = [
      { type: 'indices', name: 'uploadedIndices' },
      { type: 'bhav', name: 'uploadedBhav' },
      { type: 'premarket', name: 'uploadedPreMarket' },
      { type: 'marketactivity', name: 'uploadedMarketActivity' },
      { type: '52w', name: 'uploadedWeek52' }
    ];

    const report = {
      scanned: {},
      mismatches: 0,
      moved: 0,
      updated: 0,
      skippedUnknown: 0,
      examples: [],
      errors: []
    };
    
    // Initialize scanned counts per collection
    allCollections.forEach(({ type }) => {
      report.scanned[type] = 0;
    });

    // Calculate date threshold
    let dateThreshold = null;
    if (days > 0) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);
      dateThreshold = thresholdDate.toISOString().split('T')[0];
    }

    // Scan each collection
    for (const { type, name } of allCollections) {
      try {
        const collection = db.collection(name);
        
        // Build query
        const query = {};
        if (dateThreshold) {
          query.uploadedAt = { $gte: new Date(dateThreshold) };
        }

        const documents = await collection.find(query).toArray();
        console.log(`📊 Scanning ${name}: ${documents.length} documents`);

        for (const doc of documents) {
          report.scanned[type]++;

          const docType = doc.type || 'unknown';
          const fileName = doc.fileName || '';
          
          // Detect type from filename (canonical source)
          const detectedType = detectFileType(fileName);
          
          // Determine expected type: use detectedType if available, otherwise use collection type
          const expectedType = detectedType !== 'unknown' ? detectedType : type;
          
          // Check for mismatches
          const typeMismatch = docType !== expectedType;
          const collectionMismatch = expectedType !== type;
          
          if (typeMismatch || collectionMismatch) {
            report.mismatches++;
            
            const example = {
              fileName: fileName,
              from: name,
              to: getCollectionNameForType(expectedType) || name,
              oldType: docType,
              newType: expectedType,
              detectedType: detectedType,
              documentId: doc._id.toString(),
              date: doc.date || 'unknown'
            };
            
            // Add to examples (limit to 20)
            if (report.examples.length < 20) {
              report.examples.push(example);
            }
            
            // Fix if apply=true
            if (apply && !dryRun) {
              try {
                const correctCollectionName = getCollectionNameForType(expectedType);
                
                if (!correctCollectionName || expectedType === 'unknown') {
                  // Skip unknown types (don't delete, just skip)
                  report.skippedUnknown++;
                  console.log(`⏭️ Skipping document ${doc._id} (unknown type: ${fileName})`);
                  continue;
                }
                
                if (correctCollectionName !== name) {
                  // Move to correct collection
                  // First, update doc.type to match detected type
                  const updatedDoc = {
                    ...doc,
                    type: expectedType,
                    updatedAt: new Date()
                  };
                  
                  // Insert into correct collection
                  const correctCollection = db.collection(correctCollectionName);
                  await correctCollection.insertOne(updatedDoc);
                  
                  // Delete from wrong collection (only after successful insert)
                  await collection.deleteOne({ _id: doc._id });
                  
                  report.moved++;
                  console.log(`✅ Moved document ${doc._id} from ${name} to ${correctCollectionName} (type: ${docType} -> ${expectedType})`);
                } else if (docType !== expectedType) {
                  // Same collection, but wrong type field - just update type
                  await collection.updateOne(
                    { _id: doc._id },
                    { 
                      $set: { 
                        type: expectedType,
                        updatedAt: new Date()
                      } 
                    }
                  );
                  
                  report.updated++;
                  console.log(`✅ Updated document ${doc._id} type: ${docType} -> ${expectedType}`);
                }
              } catch (fixError) {
                report.errors.push({
                  documentId: doc._id.toString(),
                  fileName: fileName,
                  error: fixError.message
                });
                console.error(`❌ Error fixing document ${doc._id}:`, fixError.message);
              }
            }
          }
        }
      } catch (collectionError) {
        console.error(`❌ Error scanning collection ${name}:`, collectionError.message);
        report.errors.push({
          collection: name,
          error: collectionError.message
        });
      }
    }

    // Calculate total scanned
    const totalScanned = Object.values(report.scanned).reduce((sum, count) => sum + count, 0);
    
    // Summary
    console.log(`📊 [cleanup-types] Scan complete: ${totalScanned} scanned, ${report.mismatches} mismatches, ${report.moved} moved, ${report.updated} updated, ${report.skippedUnknown} skipped (unknown)`);

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      applied: apply && !dryRun,
      days: days,
      report: {
        scanned: report.scanned,
        mismatches: report.mismatches,
        moved: report.moved,
        updated: report.updated,
        skippedUnknown: report.skippedUnknown,
        examples: report.examples,
        errors: report.errors
      },
      message: dryRun 
        ? `Dry run complete. Found ${report.mismatches} mismatches. Set apply=true to fix.`
        : `Cleanup complete. Moved ${report.moved} documents, updated ${report.updated} type fields, skipped ${report.skippedUnknown} unknown types.`
    });

  } catch (error) {
    console.error('❌ Error in cleanup-types endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// Export with auth middleware (though we also check in handler)
module.exports = authMiddleware({
  requireAuth: () => false, // Admin check happens in handler
  rateLimitType: () => 'critical'
})(handler);

