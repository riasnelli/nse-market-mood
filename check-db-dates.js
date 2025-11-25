// Script to check uploaded CSV dates in MongoDB
// Run with: node check-db-dates.js

const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkUploadedDates() {
  // Get MongoDB URI from environment variable
  const uri = process.env.MONGODB_URI || process.env.storage_MONGODB_URI;
  
  if (!uri) {
    console.error('❌ MONGODB_URI or storage_MONGODB_URI environment variable is not set');
    console.log('\nPlease set the environment variable:');
    console.log('export MONGODB_URI="your-connection-string"');
    return;
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    // Get database name from URI or use default
    const url = new URL(uri);
    const dbName = url.pathname.substring(1) || 'intraq';
    const db = client.db(dbName);
    const collection = db.collection('uploadedData');

    // Get all documents, sorted by date
    const documents = await collection
      .find({})
      .sort({ date: 1, uploadedAt: -1 })
      .toArray();

    if (documents.length === 0) {
      console.log('📭 No uploaded CSV data found in database.');
      console.log('   The database is empty or no data has been uploaded yet.');
      return;
    }

    console.log(`📊 Found ${documents.length} uploaded file(s) in database:\n`);

    // Group by date
    const datesMap = new Map();
    documents.forEach(doc => {
      const date = doc.date || 'Unknown';
      if (!datesMap.has(date)) {
        datesMap.set(date, []);
      }
      datesMap.get(date).push({
        fileName: doc.fileName || 'Unknown',
        indicesCount: doc.indices?.length || 0,
        uploadedAt: doc.uploadedAt
      });
    });

    // Display dates
    const sortedDates = Array.from(datesMap.keys()).sort();
    
    console.log(`📅 Total unique dates: ${sortedDates.length}\n`);
    console.log('Dates with uploaded data:');
    console.log('─'.repeat(60));
    
    sortedDates.forEach((date, index) => {
      const files = datesMap.get(date);
      console.log(`\n${index + 1}. ${date}`);
      console.log(`   Files: ${files.length}`);
      files.forEach((file, fileIndex) => {
        console.log(`      ${fileIndex + 1}. ${file.fileName}`);
        console.log(`         Indices: ${file.indicesCount}`);
        console.log(`         Uploaded: ${new Date(file.uploadedAt).toLocaleString()}`);
      });
    });

    console.log('\n' + '─'.repeat(60));
    console.log(`\n✅ Summary: ${sortedDates.length} unique date(s) with uploaded data`);
    console.log(`   Total files: ${documents.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('authentication')) {
      console.log('\n💡 Tip: Check your MongoDB connection string and credentials.');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Tip: Check your network connection and MongoDB cluster status.');
    }
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the check
checkUploadedDates().catch(console.error);

