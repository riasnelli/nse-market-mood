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
      scanned: 0,
      issues: [],
      fixed: 0,
      deleted: 0,
      errors: []
    };

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
          report.scanned++;

          // Check 1: Does doc.type match collection type?
          const docType = doc.type || 'unknown';
          if (docType !== type && docType !== 'unknown') {
            const issue = {
              collection: name,
              documentId: doc._id.toString(),
              fileName: doc.fileName || 'unknown',
              date: doc.date || 'unknown',
              issue: 'type_mismatch',
              docType: docType,
              expectedType: type,
              detectedType: null
            };

            // Check 2: Does filename suggest a different type?
            if (doc.fileName) {
              const detectedType = detectFileType(doc.fileName);
              issue.detectedType = detectedType;
              
              if (detectedType !== 'unknown' && detectedType !== docType) {
                issue.issue = 'type_and_filename_mismatch';
              }
            }

            report.issues.push(issue);

            // Fix if apply=true
            if (apply && !dryRun) {
              try {
                const correctCollectionName = getCollectionNameForType(docType);
                if (correctCollectionName && correctCollectionName !== name) {
                  // Move to correct collection
                  const correctCollection = db.collection(correctCollectionName);
                  await correctCollection.insertOne(doc);
                  await collection.deleteOne({ _id: doc._id });
                  report.fixed++;
                  console.log(`✅ Moved document ${doc._id} from ${name} to ${correctCollectionName}`);
                } else if (docType === 'unknown' || !correctCollectionName) {
                  // Delete if type is unknown or invalid
                  await collection.deleteOne({ _id: doc._id });
                  report.deleted++;
                  console.log(`🗑️ Deleted document ${doc._id} from ${name} (unknown/invalid type)`);
                }
              } catch (fixError) {
                report.errors.push({
                  documentId: doc._id.toString(),
                  error: fixError.message
                });
                console.error(`❌ Error fixing document ${doc._id}:`, fixError.message);
              }
            }
          }

          // Check 3: Does filename suggest a different type than collection?
          if (doc.fileName) {
            const detectedType = detectFileType(doc.fileName);
            if (detectedType !== 'unknown' && detectedType !== type && docType === type) {
              // Filename suggests different type, but doc.type matches collection
              // This is a warning but not necessarily wrong (user might have selected correctly)
              // Only flag if it's a clear mismatch
              const issue = {
                collection: name,
                documentId: doc._id.toString(),
                fileName: doc.fileName,
                date: doc.date || 'unknown',
                issue: 'filename_suggests_different_type',
                docType: docType,
                expectedType: type,
                detectedType: detectedType
              };
              report.issues.push(issue);
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

    // Summary
    console.log(`📊 [cleanup-types] Scan complete: ${report.scanned} scanned, ${report.issues.length} issues, ${report.fixed} fixed, ${report.deleted} deleted`);

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      applied: apply && !dryRun,
      days: days,
      report: {
        scanned: report.scanned,
        issues_found: report.issues.length,
        fixed: report.fixed,
        deleted: report.deleted,
        errors: report.errors.length,
        issues: report.issues,
        errors: report.errors
      },
      message: dryRun 
        ? `Dry run complete. Found ${report.issues.length} issues. Set apply=true to fix.`
        : `Cleanup complete. Fixed ${report.fixed} issues, deleted ${report.deleted} invalid records.`
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

