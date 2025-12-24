/**
 * One-time cleanup script to remove or fix documents with invalid dates
 * 
 * This script finds documents where:
 * - date field has invalid format (e.g., "2212-20-25")
 * - month > 12 or year > 2100
 * 
 * Usage: node api/scripts/cleanup-invalid-dates.js
 * 
 * Set DRY_RUN=true to see what would be deleted without actually deleting
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to true for safety

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  process.exit(1);
}

// Collections to check
const COLLECTIONS = [
  'uploadedIndices',
  'uploadedBhav',
  'uploadedPreMarket',
  'uploadedMarketActivity',
  'uploadedWeek52',
  'dailyIndices',
  'dailyBhav',
  'dailyPreMarket',
  'dailyMarketActivity',
  'dailyWeek52'
];

/**
 * Validate date string
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} - True if valid YYYY-MM-DD format with valid ranges
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }
  
  // Must match YYYY-MM-DD format
  const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateStr.match(dateRegex);
  
  if (!match) {
    return false;
  }
  
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  
  // Validate ranges
  if (year < 2000 || year > 2100) {
    return false;
  }
  
  if (month < 1 || month > 12) {
    return false;
  }
  
  if (day < 1 || day > 31) {
    return false;
  }
  
  return true;
}

async function cleanupInvalidDates() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    let totalInvalid = 0;
    let totalDeleted = 0;
    
    for (const collectionName of COLLECTIONS) {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments({});
      
      if (count === 0) {
        console.log(`⏭️  Skipping ${collectionName} (empty)`);
        continue;
      }
      
      console.log(`\n📊 Checking ${collectionName} (${count} documents)...`);
      
      // Find documents with invalid dates
      const invalidDocs = await collection.find({
        $or: [
          // Date field exists but doesn't match YYYY-MM-DD format
          { date: { $exists: true, $not: { $regex: /^\d{4}-\d{2}-\d{2}$/ } } },
          // Date field is null or empty
          { date: null },
          { date: '' }
        ]
      }).toArray();
      
      // Also check for dates with invalid month/year ranges
      const allDocs = await collection.find({ date: { $exists: true } }).toArray();
      const invalidRangeDocs = [];
      
      for (const doc of allDocs) {
        if (doc.date && !isValidDate(doc.date)) {
          invalidRangeDocs.push(doc);
        }
      }
      
      // Combine and deduplicate
      const allInvalid = [...new Map([...invalidDocs, ...invalidRangeDocs].map(d => [d._id.toString(), d])).values()];
      
      if (allInvalid.length === 0) {
        console.log(`   ✅ No invalid dates found`);
        continue;
      }
      
      totalInvalid += allInvalid.length;
      console.log(`   ⚠️  Found ${allInvalid.length} documents with invalid dates`);
      
      // Show sample invalid dates
      const sampleDates = [...new Set(allInvalid.slice(0, 10).map(d => d.date).filter(Boolean))];
      if (sampleDates.length > 0) {
        console.log(`   Sample invalid dates: ${sampleDates.join(', ')}`);
      }
      
      if (DRY_RUN) {
        console.log(`   🔍 DRY RUN: Would delete ${allInvalid.length} documents`);
      } else {
        // Delete invalid documents
        const ids = allInvalid.map(d => d._id);
        const result = await collection.deleteMany({ _id: { $in: ids } });
        totalDeleted += result.deletedCount;
        console.log(`   🗑️  Deleted ${result.deletedCount} documents`);
      }
    }
    
    console.log(`\n📈 Summary:`);
    console.log(`   Total invalid documents found: ${totalInvalid}`);
    if (DRY_RUN) {
      console.log(`   🔍 DRY RUN mode - no documents were actually deleted`);
      console.log(`   Set DRY_RUN=false to actually delete these documents`);
    } else {
      console.log(`   Total documents deleted: ${totalDeleted}`);
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Cleanup script completed');
  }
}

// Run cleanup
cleanupInvalidDates().catch(console.error);

