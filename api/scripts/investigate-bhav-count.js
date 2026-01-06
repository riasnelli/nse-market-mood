#!/usr/bin/env node

/**
 * Investigation script to check bhav count for a specific date
 * Helps diagnose low row count issues (e.g., only 15 records instead of 300+)
 * 
 * Usage: node api/scripts/investigate-bhav-count.js [YYYY-MM-DD]
 * Example: node api/scripts/investigate-bhav-count.js 2026-01-05
 */

const { getUploadedDataCollection, getDailyBhavcopyCollection } = require('../lib/mongodb');

async function investigateBhavCount(targetDate) {
    console.log(`\n🔍 Investigating bhav count for ${targetDate}\n`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        // Check uploaded metadata
        const uploadedBhav = await getUploadedDataCollection('bhav');
        const metadataDocs = await uploadedBhav.find({ date: targetDate }).toArray();

        console.log(`📄 Metadata Documents: ${metadataDocs.length}\n`);

        if (metadataDocs.length === 0) {
            console.log(`⚠️  No metadata found for ${targetDate}`);
            console.log(`   Recommendation: Upload bhav file for this date\n`);
        } else {
            metadataDocs.forEach((doc, idx) => {
                console.log(`Document ${idx + 1}:`);
                console.log(`  File Name    : ${doc.fileName || 'Unknown'}`);
                console.log(`  Row Count    : ${doc.rowCount || 0}`);
                console.log(`  Indices Count: ${doc.indicesCount || 0}`);
                console.log(`  Array Length : ${doc.indices?.length || 0}`);
                console.log(`  Uploaded At  : ${doc.uploadedAt || 'Unknown'}`);
                console.log(`  Series Filter: ${doc.indices?.filter(i => i.series === 'EQ').length || 0} EQ stocks`);
                console.log('');
            });
        }

        // Check daily collection
        const dailyBhav = await getDailyBhavcopyCollection();
        const dailyCount = await dailyBhav.countDocuments({ date: targetDate, series: 'EQ' });
        const totalCount = await dailyBhav.countDocuments({ date: targetDate });

        console.log(`📊 Daily Bhavcopy Collection:\n`);
        console.log(`  Total records : ${totalCount}`);
        console.log(`  EQ series     : ${dailyCount}`);
        console.log('');

        // Get sample records
        const samples = await dailyBhav.find({ date: targetDate, series: 'EQ' })
            .limit(10)
            .toArray();

        if (samples.length > 0) {
            console.log(`📋 Sample Records (first ${samples.length}):\n`);
            samples.forEach((s, idx) => {
                console.log(`  ${(idx + 1).toString().padStart(2)}. ${s.symbol.padEnd(20)} Close: ₹${s.close?.toFixed(2) || 'N/A'}  Volume: ${s.volume?.toLocaleString() || 'N/A'}`);
            });
            console.log('');
        } else {
            console.log(`⚠️  No sample records found\n`);
        }

        // Analyze and provide recommendations
        console.log(`${'='.repeat(60)}\n`);
        console.log(`📈 Analysis:\n`);

        const expectedMinimum = 300; // NSE typically has 300+ EQ stocks

        if (dailyCount === 0 && metadataDocs.length === 0) {
            console.log(`❌ CRITICAL: No data found for ${targetDate}`);
            console.log(`   Recommendation: Upload bhav file for this date\n`);
        } else if (dailyCount < expectedMinimum) {
            console.log(`⚠️  WARNING: Only ${dailyCount} EQ stocks found (expected ${expectedMinimum}+)`);
            console.log(`   Possible causes:`);
            console.log(`     1. CSV file was truncated/incomplete during upload`);
            console.log(`     2. Parsing error during CSV processing`);
            console.log(`     3. Network interruption during upload`);
            console.log(`   Recommendation: Re-upload bhav file for ${targetDate}\n`);

            // Check for chunked uploads
            if (metadataDocs.length > 1) {
                console.log(`   ℹ️  Note: Found ${metadataDocs.length} metadata chunks`);
                console.log(`      This might indicate a chunked upload issue\n`);
            }
        } else {
            console.log(`✅ NORMAL: Bhav count looks good (${dailyCount} stocks)`);
            console.log(`   Data quality appears to be acceptable\n`);
        }

        // Check for series distribution
        if (totalCount > dailyCount) {
            const nonEqCount = totalCount - dailyCount;
            console.log(`ℹ️  INFO: Found ${nonEqCount} non-EQ series records`);
            console.log(`   This is normal (BE, BZ, etc. series are excluded from signals)\n`);
        }

    } catch (error) {
        console.error(`\n❌ Investigation failed: ${error.message}\n`);
        console.error(error.stack);
    }

    console.log(`${'='.repeat(60)}\n`);
    process.exit(0);
}

// Get date from command line args or use default
const targetDate = process.argv[2] || '2026-01-05';

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error(`\n❌ Invalid date format: ${targetDate}`);
    console.error(`   Expected format: YYYY-MM-DD`);
    console.error(`   Example: node investigate-bhav-count.js 2026-01-05\n`);
    process.exit(1);
}

// Run investigation
investigateBhavCount(targetDate).catch(error => {
    console.error('\n❌ Investigation failed:', error);
    process.exit(1);
});
