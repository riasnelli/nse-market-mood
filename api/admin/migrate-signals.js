/**
 * Admin Migration Endpoint
 * 
 * POST /api/admin/migrate-signals
 * 
 * Generates signals for existing uploaded data that doesn't have signals yet.
 * Scans uploaded collections and generates signals for dates that have data but no signals.
 * 
 * Requires: x-app-key header matching APP_KEY environment variable
 * 
 * Query params:
 * - dry_run=true (default) - Only report what would be generated, don't actually generate
 * - apply=true - Actually generate signals
 * - days=N - Process last N days (default: 30, use 0 for all)
 * - strategy=strategy_name - Strategy to use (default: momentum_gap)
 */

const { connectToDatabase, getUploadedDataCollection, getSignalsStoreCollection } = require('../lib/mongodb');
const { generateSignalsForDate } = require('../lib/signals/generateSignals');

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
 * Get yesterday's date (skip weekends)
 */
function getYesterdayDate(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
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
    const strategy = req.query.strategy || 'momentum_gap';

    console.log(`🔄 [migrate-signals] Starting migration: dry_run=${dryRun}, apply=${apply}, days=${days}, strategy=${strategy}`);

    const { db } = await connectToDatabase();
    const signalsStoreCollection = await getSignalsStoreCollection();

    // Calculate date threshold
    let dateThreshold = null;
    if (days > 0) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);
      dateThreshold = thresholdDate.toISOString().split('T')[0];
    }

    // Get all dates that have bhavcopy data (from both uploaded and daily collections)
    const bhavCollection = await getUploadedDataCollection('bhav');
    const premarketCollection = await getUploadedDataCollection('premarket');
    const { getDailyBhavcopyCollection, getPreMarketDataCollection } = require('../lib/mongodb');
    const dailyBhavCollection = await getDailyBhavcopyCollection();
    const dailyPremarketCollection = await getPreMarketDataCollection();

    // Build query for date threshold
    const dateQuery = dateThreshold ? { date: { $gte: dateThreshold } } : {};

    // Get all unique dates from both uploaded and daily collections
    const uploadedBhavDates = await bhavCollection.distinct('date', dateQuery);
    const uploadedPremarketDates = await premarketCollection.distinct('date', dateQuery);
    const dailyBhavDates = await dailyBhavCollection.distinct('date', dateQuery);
    const dailyPremarketDates = await dailyPremarketCollection.distinct('date', dateQuery);
    
    // Combine dates (deduplicate)
    const allBhavDates = [...new Set([...uploadedBhavDates, ...dailyBhavDates])];
    const allPremarketDates = [...new Set([...uploadedPremarketDates, ...dailyPremarketDates])];

    // Get all dates that already have signals
    const existingSignals = await signalsStoreCollection
      .find({ strategy, ...dateQuery })
      .toArray();
    const existingSignalDates = new Set(existingSignals.map(s => s.date));

    // Find dates that need signals
    // For momentum_gap: need bhavcopy for yesterday AND premarket for today
    const datesToProcess = new Set();
    
    // For each premarket date, check if we have bhavcopy for yesterday
    for (const premarketDate of allPremarketDates) {
      const yesterdayDate = getYesterdayDate(premarketDate);
      if (allBhavDates.includes(yesterdayDate)) {
        // We have both premarket (today) and bhavcopy (yesterday)
        if (!existingSignalDates.has(premarketDate)) {
          datesToProcess.add(premarketDate);
        }
      }
    }
    
    // Also check dates that have bhavcopy but might not have premarket yet
    // (they'll get INSUFFICIENT_DATA status)
    for (const bhavDate of allBhavDates) {
      // Find next trading day (tomorrow)
      const tomorrowDate = new Date(bhavDate);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      while (tomorrowDate.getDay() === 0 || tomorrowDate.getDay() === 6) {
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      }
      const tomorrowDateStr = tomorrowDate.toISOString().split('T')[0];
      
      if (!existingSignalDates.has(tomorrowDateStr)) {
        datesToProcess.add(tomorrowDateStr);
      }
    }

    const datesArray = Array.from(datesToProcess).sort();

    console.log(`📊 [migrate-signals] Found ${datesArray.length} dates that need signals`);

    const report = {
      scanned: datesArray.length,
      processed: 0,
      byStatus: {
        READY: 0,
        NO_MATCH: 0,
        INSUFFICIENT_DATA: 0,
        ERROR: 0
      },
      errors: [],
      results: []
    };

    if (dryRun) {
      // Dry run - just report what would be done
      for (const date of datesArray) {
        const yesterdayDate = getYesterdayDate(date);
        report.results.push({
          date,
          bhavcopyDate: yesterdayDate,
          status: 'would_generate',
          message: `Would generate signals for ${date} (bhavcopy: ${yesterdayDate}, premarket: ${date})`
        });
      }
    } else if (apply) {
      // Actually generate signals
      for (const date of datesArray) {
        try {
          report.processed++;
          console.log(`🔄 [migrate-signals] Generating signals for ${date}...`);
          
          const result = await generateSignalsForDate(date, strategy);
          
          // Track by status
          if (report.byStatus.hasOwnProperty(result.status)) {
            report.byStatus[result.status]++;
          }
          
          report.results.push({
            date: result.date,
            status: result.status,
            signal_count: result.signal_count || 0,
            message: result.message,
            missingFiles: result.missingFiles || null
          });

          if (result.status === 'READY' || result.status === 'NO_MATCH' || result.status === 'INSUFFICIENT_DATA') {
            // These are valid outcomes, not errors
            console.log(`✅ [migrate-signals] ${date}: ${result.status} (${result.signal_count || 0} signals)`);
          } else {
            report.errors.push({
              date: result.date,
              status: result.status,
              message: result.message,
              missingFiles: result.missingFiles
            });
            console.error(`❌ [migrate-signals] ${date}: ${result.status} - ${result.message}`);
          }
        } catch (error) {
          report.byStatus.ERROR++;
          console.error(`❌ [migrate-signals] Error generating signals for ${date}:`, error.message);
          report.errors.push({
            date,
            error: error.message,
            status: 'ERROR'
          });
        }
      }
    }

    const totalSuccessful = report.byStatus.READY + report.byStatus.NO_MATCH + report.byStatus.INSUFFICIENT_DATA;
    console.log(`✅ [migrate-signals] Migration complete: ${report.processed} processed, ${totalSuccessful} successful (READY: ${report.byStatus.READY}, NO_MATCH: ${report.byStatus.NO_MATCH}, INSUFFICIENT_DATA: ${report.byStatus.INSUFFICIENT_DATA}, ERROR: ${report.byStatus.ERROR})`);

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      applied: apply && !dryRun,
      days: days,
      strategy: strategy,
      report: {
        scanned: report.scanned,
        processed: report.processed,
        byStatus: report.byStatus,
        successful: totalSuccessful,
        errors: report.errors.length,
        results: report.results,
        errors: report.errors
      },
      message: dryRun
        ? `Dry run complete. Found ${report.scanned} dates that need signals. Set apply=true to generate.`
        : `Migration complete. Processed ${report.processed} dates: ${report.byStatus.READY} READY, ${report.byStatus.NO_MATCH} NO_MATCH, ${report.byStatus.INSUFFICIENT_DATA} INSUFFICIENT_DATA, ${report.byStatus.ERROR} ERROR.`
    });

  } catch (error) {
    console.error('❌ Error in migrate-signals endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

// Export with auth middleware
const { authMiddleware } = require('../lib/auth');
module.exports = authMiddleware({
  requireAuth: () => false, // Admin check happens in handler
  rateLimitType: () => 'critical'
})(handler);

