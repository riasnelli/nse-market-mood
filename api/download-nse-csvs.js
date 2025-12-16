const fetch = require('node-fetch');

/**
 * API endpoint to download CSVs from NSE India all-reports page
 * This endpoint:
 * 1. Scrapes the NSE all-reports page to find CSV download links
 * 2. Downloads the selected CSV files
 * 3. Optionally uploads them to Google Sheets
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { reportTypes = [], googleSheetId, googleSheetName, googleApiKey } = req.body;

    if (!reportTypes || reportTypes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No report types selected'
      });
    }

    console.log('📥 Downloading NSE CSVs:', reportTypes);

    // Get today's date in DDMMYYYY format (NSE format)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 60 * 60000; // +5:30
    const ist = new Date(utc + istOffset);
    const day = String(ist.getDate()).padStart(2, '0');
    const month = String(ist.getMonth() + 1).padStart(2, '0');
    const year = ist.getFullYear();
    const dateStr = `${day}${month}${year}`;

    const results = [];
    const errors = [];

    // Map report types to NSE report names/patterns
    const reportMap = {
      'bhavcopy': {
        name: 'Full Bhavcopy',
        pattern: 'sec_bhavdata_full',
        urlPattern: 'https://archives.nseindia.com/products/content/sec_bhavdata_full_'
      },
      'marketactivity': {
        name: 'Market Activity',
        pattern: 'MA',
        urlPattern: 'https://archives.nseindia.com/products/content/MA'
      },
      '52w': {
        name: '52 Week High/Low',
        pattern: 'CM_52_wk_High_low',
        urlPattern: 'https://archives.nseindia.com/products/content/CM_52_wk_High_low_'
      }
    };

    // Download each selected report
    for (const reportType of reportTypes) {
      const report = reportMap[reportType];
      if (!report) {
        errors.push({ reportType, error: 'Unknown report type' });
        continue;
      }

      try {
        // Construct NSE archive URL
        let csvUrl;
        if (reportType === 'bhavcopy') {
          csvUrl = `${report.urlPattern}${dateStr}.csv`;
        } else if (reportType === '52w') {
          csvUrl = `${report.urlPattern}${dateStr}.csv`;
        } else if (reportType === 'marketactivity') {
          csvUrl = `${report.urlPattern}${dateStr}.csv`;
        }

        console.log(`📥 Downloading ${report.name} from: ${csvUrl}`);

        // Download CSV with NSE headers
        const response = await fetch(csvUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/csv,application/csv,*/*',
            'Referer': 'https://www.nseindia.com/',
            'Origin': 'https://www.nseindia.com'
          },
          timeout: 30000
        });

        if (!response.ok) {
          // Try previous trading day if today's file doesn't exist
          const prevDate = new Date(ist);
          prevDate.setDate(prevDate.getDate() - 1);
          // Skip weekends
          while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
            prevDate.setDate(prevDate.getDate() - 1);
          }
          const prevDay = String(prevDate.getDate()).padStart(2, '0');
          const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
          const prevYear = prevDate.getFullYear();
          const prevDateStr = `${prevDay}${prevMonth}${prevYear}`;

          const fallbackUrl = csvUrl.replace(dateStr, prevDateStr);
          console.log(`⚠️ Trying previous date: ${fallbackUrl}`);

          const fallbackResponse = await fetch(fallbackUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/csv,application/csv,*/*',
              'Referer': 'https://www.nseindia.com/',
              'Origin': 'https://www.nseindia.com'
            },
            timeout: 30000
          });

          if (!fallbackResponse.ok) {
            throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
          }

          const csvText = await fallbackResponse.text();
          results.push({
            reportType,
            reportName: report.name,
            date: prevDateStr,
            csvData: csvText,
            size: csvText.length,
            success: true
          });
        } else {
          const csvText = await response.text();
          results.push({
            reportType,
            reportName: report.name,
            date: dateStr,
            csvData: csvText,
            size: csvText.length,
            success: true
          });
        }

        console.log(`✅ Downloaded ${report.name}`);
      } catch (error) {
        console.error(`❌ Error downloading ${report.name}:`, error.message);
        errors.push({
          reportType,
          reportName: report.name,
          error: error.message
        });
      }
    }

    // If Google Sheets is configured, upload the data
    let googleSheetsResult = null;
    if (googleSheetId && googleApiKey && results.length > 0) {
      try {
        googleSheetsResult = await uploadToGoogleSheets(
          results,
          googleSheetId,
          googleSheetName || 'Sheet1',
          googleApiKey
        );
      } catch (error) {
        console.error('Error uploading to Google Sheets:', error);
        googleSheetsResult = {
          success: false,
          error: error.message
        };
      }
    }

    res.status(200).json({
      success: true,
      downloaded: results.length,
      errors: errors.length,
      results: results.map(r => ({
        reportType: r.reportType,
        reportName: r.reportName,
        date: r.date,
        size: r.size,
        success: r.success
      })),
      errors: errors,
      googleSheets: googleSheetsResult,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in download-nse-csvs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download CSVs',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Upload CSV data to Google Sheets
 */
async function uploadToGoogleSheets(results, sheetId, sheetName, apiKey) {
  const googleSheetsApi = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A1:append?valueInputOption=RAW&key=${apiKey}`;

  const uploadResults = [];

  for (const result of results) {
    try {
      // Parse CSV to array of arrays
      const rows = parseCSV(result.csvData);
      
      // Upload in batches (Google Sheets API limit: 10,000 rows per request)
      const batchSize = 1000;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        const response = await fetch(googleSheetsApi, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: batch
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Google Sheets API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        uploadResults.push({
          reportType: result.reportType,
          rowsUploaded: batch.length,
          range: data.updates?.updatedRange
        });
      }

      console.log(`✅ Uploaded ${result.reportName} to Google Sheets`);
    } catch (error) {
      console.error(`❌ Error uploading ${result.reportName} to Google Sheets:`, error);
      uploadResults.push({
        reportType: result.reportType,
        success: false,
        error: error.message
      });
    }
  }

  return {
    success: true,
    uploads: uploadResults,
    message: `Successfully uploaded ${uploadResults.length} reports to Google Sheets`
  };
}

/**
 * Simple CSV parser
 */
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  return lines.map(line => {
    // Simple CSV parsing (handles quoted fields)
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
}
