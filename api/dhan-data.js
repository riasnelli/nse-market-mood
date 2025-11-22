const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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
    // Get credentials from request body, query params, or environment
    let clientId, accessToken, apiKey, apiSecret, customEndpoint;
    
    if (req.method === 'POST' && req.body) {
      clientId = req.body.clientId;
      accessToken = req.body.accessToken;
      apiKey = req.body.apiKey;
      apiSecret = req.body.apiSecret;
      customEndpoint = req.body.customEndpoint;
    } else if (req.query) {
      clientId = req.query.clientId;
      accessToken = req.query.accessToken;
      apiKey = req.query.apiKey;
      apiSecret = req.query.apiSecret;
      customEndpoint = req.query.customEndpoint;
    }
    
    // Fallback to environment variables
    clientId = clientId || process.env.DHAN_CLIENT_ID;
    accessToken = accessToken || process.env.DHAN_ACCESS_TOKEN;
    apiKey = apiKey || process.env.DHAN_API_KEY;
    apiSecret = apiSecret || process.env.DHAN_API_SECRET;
    customEndpoint = customEndpoint || process.env.DHAN_CUSTOM_ENDPOINT;

    if (!accessToken) {
      throw new Error('Dhan API access token not provided. Please configure in settings.');
    }

    console.log('Fetching data from Dhan API...');

    // Dhan API v2 - Based on documentation: https://dhanhq.co/docs/v2/
    // Base URL: https://api.dhan.co/v2/ (with /v2/ prefix)
    const baseUrl = 'https://api.dhan.co/v2';
    
    const headers = {
      'access-token': accessToken,
      'Content-Type': 'application/json'
    };
    
    // Add Client ID if provided (some endpoints may require it)
    if (clientId) {
      headers['client-id'] = clientId;
    }
    
    // Add API Key/Secret if provided (for v2.4+)
    if (apiKey) {
      headers['api-key'] = apiKey;
    }
    if (apiSecret) {
      headers['api-secret'] = apiSecret;
    }

    // Step 1: Try to get instruments/indices list first to get correct securityIds
    console.log('Step 1: Fetching instruments list to get correct securityIds...');
    let securityIds = [];
    
    const instrumentsEndpoints = [
      '/instruments/indices',
      '/master/indices',
      '/instruments',
      '/master',
      '/indices'
    ];
    
    for (const instEndpoint of instrumentsEndpoints) {
      try {
        const instUrl = `${baseUrl}${instEndpoint}`;
        console.log(`Trying instruments endpoint: ${instUrl}`);
        
        const instResponse = await fetch(instUrl, {
          method: 'GET',
          headers: headers,
          timeout: 10000
        });
        
        if (instResponse.ok) {
          const instData = await instResponse.json();
          console.log('Instruments response sample:', JSON.stringify(instData).substring(0, 1000));
          
          // Try to extract securityIds from instruments response
          let instrumentsList = [];
          if (Array.isArray(instData)) {
            instrumentsList = instData;
          } else if (instData.data && Array.isArray(instData.data)) {
            instrumentsList = instData.data;
          } else if (instData.result && Array.isArray(instData.result)) {
            instrumentsList = instData.result;
          }
          
          if (instrumentsList.length > 0) {
            // Find NIFTY indices in the list
            const niftyIndices = instrumentsList.filter(inst => {
              const name = (inst.name || inst.symbol || inst.securityId || inst.instrumentName || '').toString().toUpperCase();
              return name.includes('NIFTY') || name.includes('VIX');
            });
            
            securityIds = niftyIndices.map(inst => inst.securityId || inst.instrumentId || inst.id || inst.security_id);
            securityIds = securityIds.filter(id => id); // Remove undefined/null
            
            if (securityIds.length > 0) {
              console.log(`✅ Found ${securityIds.length} indices with securityIds:`, securityIds.slice(0, 5));
              break;
            }
          }
        }
      } catch (e) {
        console.log(`Instruments endpoint ${instEndpoint} failed:`, e.message);
        continue;
      }
    }
    
    // If we couldn't get securityIds from instruments API, use fallback
    if (securityIds.length === 0) {
      console.warn('⚠️ Could not fetch instruments. Will try with symbol names and common formats.');
    }

    // If custom endpoint provided, use it first
    let endpoints = [];
    if (customEndpoint && customEndpoint.trim()) {
      // Ensure custom endpoint doesn't start with /v2/ if baseUrl already has it
      const cleanEndpoint = customEndpoint.trim().startsWith('/v2/') 
        ? customEndpoint.trim().substring(3) 
        : customEndpoint.trim();
      endpoints = [cleanEndpoint];
    } else {
      // Based on Dhan API v2 documentation - Market Quote API endpoints
      // Documentation: https://dhanhq.co/docs/v2/
      // Market Quote endpoints under Data APIs section
      endpoints = [
        '/marketfeed/ltp',                 // Market Quote - Last Traded Price (POST)
        '/marketfeed/ohlc',                // Market Quote - OHLC (POST)
        '/marketfeed/quote',               // Market Quote - Full Quote (POST)
        '/marketfeed/indices',             // Market Quote - Indices (POST)
        '/market-quote/indices',           // Alternative format
        '/market-quote',                   // Base market quote
        '/indices',                        // Direct indices endpoint
        '/master/indices',                 // Master data indices
        '/instruments/indices'             // Instruments list for indices
      ];
    }

    let indicesResponse = null;
    let indicesData = null;
    let lastError = null;
    let workingEndpoint = null;

    // Try each endpoint with POST method (as per Dhan API v2 docs)
    // Market Quote APIs use POST with request body
    for (const endpoint of endpoints) {
      for (const method of ['POST', 'GET']) {
        try {
          const fullUrl = `${baseUrl}${endpoint}`;
          console.log(`Trying Dhan API ${method}: ${fullUrl}`);
          
          const fetchOptions = {
            method: method,
            headers: headers,
            timeout: 10000
          };
          
          // For POST requests, include request body with indices
          if (method === 'POST') {
            let requestBody;
            
            // Use securityIds from instruments API if available, otherwise try symbol names
            if (securityIds.length > 0) {
              // Use numeric securityIds from instruments API
              requestBody = {
                securityId: securityIds.slice(0, 15) // Limit to 15 to avoid too many
              };
              console.log('✅ Using securityIds from instruments API:', requestBody.securityId.slice(0, 5));
            } else {
              // Fallback: Try different symbol name formats based on endpoint
              if (endpoint.includes('ltp') || endpoint.includes('quote')) {
                // Try with exchange segment for LTP/Quote endpoints
                requestBody = {
                  securityId: [
                    { securityId: 'NIFTY 50', exchangeSegment: 'INDEX' },
                    { securityId: 'NIFTY BANK', exchangeSegment: 'INDEX' },
                    { securityId: 'NIFTY IT', exchangeSegment: 'INDEX' }
                  ]
                };
                console.log('Trying with exchangeSegment format');
              } else {
                // Simple array format
                requestBody = {
                  securityId: [
                    'NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY PHARMA', 
                    'NIFTY AUTO', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY REALTY', 
                    'NIFTY PSU BANK', 'NIFTY PRIVATE BANK', 'NIFTY ENERGY', 
                    'NIFTY INFRA', 'NIFTY MIDCAP 50', 'NIFTY SMLCAP 50', 
                    'NIFTY 100', 'INDIA VIX'
                  ]
                };
                console.log('Using symbol names array format');
              }
            }
            
            fetchOptions.body = JSON.stringify(requestBody);
            console.log('📤 Request body:', JSON.stringify(requestBody).substring(0, 500));
          }
          
          const response = await fetch(fullUrl, fetchOptions);

          if (response.ok) {
            indicesResponse = response;
            indicesData = await response.json();
            workingEndpoint = endpoint;
            console.log(`Successfully connected to Dhan API: ${fullUrl}`);
            console.log(`Response type: ${typeof indicesData}, Is Array: ${Array.isArray(indicesData)}`);
            console.log(`Response keys: ${Object.keys(indicesData || {}).join(', ')}`);
            console.log(`Sample response (first 2000 chars): ${JSON.stringify(indicesData).substring(0, 2000)}`);
            break;
          } else if (response.status === 401 || response.status === 403) {
            // Auth error - endpoint exists but credentials wrong
            const errorText = await response.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch (e) {
              errorData = { message: errorText };
            }
            
            return res.status(200).json({
              error: true,
              message: `Authentication failed (${response.status}). Your access token might be expired.`,
              hint: 'Dhan API access tokens are valid for 24 hours only. Generate a new token from Dhan dashboard.',
              suggestion: 'Visit https://dhanhq.co/docs/v2/ to learn how to generate a new access token.',
              errorDetails: errorData,
              marketStatus: {
                isOpen: false,
                verified: false,
                reason: 'AUTH_FAILED',
                timestamp: new Date().toISOString()
              }
            });
          } else if (response.status !== 404) {
            // Other error - might be rate limit or other issue
            const errorText = await response.text();
            lastError = `Status ${response.status} at ${endpoint} (${method}): ${errorText.substring(0, 100)}`;
          }
        } catch (error) {
          lastError = error.message;
          continue;
        }
        }
      
      if (indicesData) break; // Found working endpoint, stop searching
    }

    if (!indicesData) {
      // Return a helpful error message
      return res.status(200).json({
        error: true,
        message: `Dhan API endpoints not found. All tested endpoints returned 404.`,
        hint: `Please check Dhan API v2 documentation at https://dhanhq.co/docs/v2/ for the correct endpoint.`,
        testedEndpoints: endpoints,
        suggestion: `Possible issues:\n1. Your account might not have Data API subscription enabled\n2. Check subscription at: https://web.dhan.co → My Profile → DhanHQ Trading APIs\n3. The endpoint might require different authentication\n4. Try entering a custom endpoint from Dhan API v2 documentation\n5. Contact Dhan support: help@dhan.co`,
        helpLinks: {
          docs: 'https://dhanhq.co/docs/v2/',
          subscription: 'https://web.dhan.co',
          support: 'mailto:help@dhan.co'
        },
        marketStatus: {
          isOpen: false,
          verified: false,
          reason: 'API_ENDPOINT_NOT_FOUND',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Log the raw response to understand structure
    console.log('Dhan API raw response:', JSON.stringify(indicesData, null, 2).substring(0, 1000));
    
    // Store indicesData in outer scope for error handling
    let rawResponseData = indicesData;
    
    // Process Dhan API response
    let processedData;
    try {
      processedData = processDhanData(indicesData);
    } catch (processError) {
      // If processing fails, include raw data in error
      console.error('Error processing Dhan data:', processError);
      return res.status(200).json({
        error: true,
        message: processError.message,
        note: 'Dhan API response received but data structure unexpected',
        debug: {
          rawResponse: {
            type: typeof rawResponseData,
            isArray: Array.isArray(rawResponseData),
            keys: Object.keys(rawResponseData || {}),
            sample: JSON.stringify(rawResponseData).substring(0, 3000)
          },
          errorDetails: processError.dataStructure || {},
          instrumentsAttempted: securityIds.length > 0 ? `Found ${securityIds.length} securityIds` : 'Instruments API failed or returned no data',
          securityIdsUsed: securityIds.length > 0 ? securityIds.slice(0, 10) : 'Used symbol names (fallback)',
          workingEndpoint: workingEndpoint || 'None found'
        },
        marketStatus: {
          isOpen: false,
          verified: false,
          reason: 'DATA_PARSING_ERROR',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Add market status
    processedData.marketStatus = {
      isOpen: checkMarketStatusFromDhan(indicesData),
      verified: true,
      reason: 'DHAN_API',
      timestamp: new Date().toISOString()
    };

    res.status(200).json(processedData);

  } catch (error) {
    console.error('Error fetching Dhan data:', error);
    console.error('Error stack:', error.stack);
    
    // Include raw data structure in error for debugging
    const errorResponse = {
      error: true,
      message: error.message,
      note: 'Dhan API failed - check credentials',
      marketStatus: {
        isOpen: false,
        verified: false,
        reason: 'API_ERROR',
        timestamp: new Date().toISOString()
      }
    };
    
    // Add debugging info if available
    if (error.rawData) {
      errorResponse.debug = {
        dataStructure: error.dataStructure,
        rawDataSample: JSON.stringify(error.rawData).substring(0, 5000),
        fullStructure: error.dataStructure?.fullStructure || JSON.stringify(error.rawData, null, 2)
      };
    }
    
    // Also log the raw response if we got one
    if (typeof indicesData !== 'undefined') {
      errorResponse.debug = errorResponse.debug || {};
      errorResponse.debug.receivedData = {
        type: typeof indicesData,
        isArray: Array.isArray(indicesData),
        keys: Object.keys(indicesData || {}),
        sample: JSON.stringify(indicesData).substring(0, 2000)
      };
    }
    
    res.status(200).json(errorResponse);
  }
};

function processDhanData(data) {
  try {
    console.log('=== Processing Dhan Data ===');
    console.log('Raw data type:', typeof data);
    console.log('Is Array:', Array.isArray(data));
    console.log('Keys:', Object.keys(data || {}));
    console.log('Full raw data:', JSON.stringify(data, null, 2).substring(0, 3000));
    
    // Dhan API Market Quote response structure
    // Response can be:
    // 1. Array of objects: [{securityId: 'NIFTY 50', LTP: 21500, ...}, ...]
    // 2. Object with data property: {data: [{...}, ...]}
    // 3. Object with keys as securityIds: {'NIFTY 50': {LTP: 21500, ...}, ...}
    // 4. Object with nested structure: {result: [{...}, ...]}
    
    let indices = [];
    
    if (Array.isArray(data)) {
      // Direct array response
      indices = data;
      console.log('Using direct array, length:', indices.length);
    } else if (data && typeof data === 'object') {
      // Check for common data properties
      if (data.data && Array.isArray(data.data)) {
        indices = data.data;
        console.log('Using data.data array, length:', indices.length);
      } else if (data.indices && Array.isArray(data.indices)) {
        indices = data.indices;
        console.log('Using data.indices array, length:', indices.length);
      } else if (data.result && Array.isArray(data.result)) {
        indices = data.result;
        console.log('Using data.result array, length:', indices.length);
      } else if (data.response && Array.isArray(data.response)) {
        indices = data.response;
        console.log('Using data.response array, length:', indices.length);
      } else {
        // Check if object keys are securityIds (object with securityId as keys)
        const keys = Object.keys(data);
        const firstValue = data[keys[0]];
        
        // If values are objects with LTP/price fields, treat keys as securityIds
        if (keys.length > 0 && firstValue && typeof firstValue === 'object' && 
            (firstValue.LTP !== undefined || firstValue.lastPrice !== undefined || firstValue.price !== undefined)) {
          // Convert object to array format
          indices = keys.map(key => ({
            securityId: key,
            ...data[key]
          }));
          console.log('Converted object keys to array, length:', indices.length);
        } else {
          // Try to find any array in the object
          const values = Object.values(data);
          const arrayValue = values.find(v => Array.isArray(v) && v.length > 0);
          if (arrayValue) {
            indices = arrayValue;
            console.log('Found array in object values, length:', indices.length);
          }
        }
      }
    }
    
    console.log(`Final indices array length: ${indices.length}`);
    
    // Handle case where data.data is an empty object (Dhan API returns {data: {}, status: "success"})
    if (indices.length === 0 && data && typeof data === 'object' && data.data && typeof data.data === 'object') {
      // Check if data.data is empty object
      const dataKeys = Object.keys(data.data);
      if (dataKeys.length === 0) {
        console.warn('⚠️ Dhan API returned empty data object: {data: {}, status: "success"}');
        console.warn('This means:');
        console.warn('1. ✅ Authentication is working (status: success)');
        console.warn('2. ❌ But securityId format is likely incorrect');
        console.warn('3. ❌ Or the endpoint doesn\'t recognize the symbol names');
        console.warn('4. ❌ Or you need to use numeric securityIds instead of names');
        console.warn('');
        console.warn('💡 Solution: You may need to:');
        console.warn('   - Use the Instruments API to get correct securityIds');
        console.warn('   - Use numeric IDs instead of symbol names');
        console.warn('   - Try different securityId format (without spaces, underscores, etc.)');
        console.warn('   - Check Dhan API v2 docs for correct format');
        
        const error = new Error('Dhan API returned empty data. Authentication works but securityId format may be incorrect. Try using numeric securityIds or check the Instruments API for correct IDs.');
        error.rawData = data;
        error.dataStructure = {
          type: typeof data,
          isArray: Array.isArray(data),
          keys: Object.keys(data || {}),
          dataKeys: Object.keys(data.data || {}),
          sample: JSON.stringify(data).substring(0, 5000),
          fullStructure: JSON.stringify(data, null, 2),
          hint: 'Dhan API returned {data: {}, status: "success"}. Authentication works but no data returned. This usually means: 1) securityId format is wrong (try numeric IDs), 2) need to use Instruments API to get correct IDs, 3) check Dhan API v2 docs for correct securityId format'
        };
        throw error;
      } else {
        // data.data has keys - might be an object with securityIds as keys
        indices = Object.entries(data.data).map(([key, value]) => ({
          securityId: key,
          ...(typeof value === 'object' ? value : { value })
        }));
        console.log(`Found ${indices.length} indices in data.data object`);
      }
    }
    
    // Try one more approach - check if data itself is an object with market data
    if (indices.length === 0 && data && typeof data === 'object' && !Array.isArray(data)) {
      // Check if it's a single quote object (not an array)
      const hasMarketFields = data.LTP !== undefined || data.lastPrice !== undefined || 
                             data.close !== undefined || data.price !== undefined;
      if (hasMarketFields) {
        // Single quote response - wrap in array
        indices = [data];
        console.log('Found single quote object, wrapping in array');
      } else {
        // Check all nested objects for market data
        const allValues = Object.values(data);
        const marketDataObjects = allValues.filter(v => 
          v && typeof v === 'object' && 
          (v.LTP !== undefined || v.lastPrice !== undefined || v.close !== undefined)
        );
        if (marketDataObjects.length > 0) {
          indices = marketDataObjects;
          console.log(`Found ${marketDataObjects.length} market data objects in nested structure`);
        }
      }
    }
    
    if (indices.length === 0) {
      const error = new Error('No indices data found in Dhan API response');
      error.rawData = data;
      error.dataStructure = {
        type: typeof data,
        isArray: Array.isArray(data),
        keys: Object.keys(data || {}),
        sample: JSON.stringify(data).substring(0, 5000),
        fullStructure: JSON.stringify(data, null, 2)
      };
      throw error;
    }
    
    // Log first index structure
    if (indices.length > 0) {
      console.log('First index sample:', JSON.stringify(indices[0], null, 2));
    }
    
    // Dhan API Market Quote fields:
    // - securityId: symbol identifier
    // - LTP: Last Traded Price
    // - change: price change
    // - changePercent: percentage change
    // - open, high, low, close: OHLC values
    
    // Find key indices by securityId or symbol
    const nifty50 = indices.find(idx => {
      const id = (idx.securityId || idx.symbol || idx.name || '').toString().toUpperCase();
      return id === 'NIFTY' || id === 'NIFTY 50' || id.includes('NIFTY50') || id === 'NIFTY_50';
    });
    
    const bankNifty = indices.find(idx => {
      const id = (idx.securityId || idx.symbol || idx.name || '').toString().toUpperCase();
      return id === 'BANKNIFTY' || id === 'NIFTY BANK' || id.includes('BANKNIFTY') || id === 'NIFTY_BANK';
    });

    const vix = indices.find(idx => {
      const id = (idx.securityId || idx.symbol || idx.name || '').toString().toUpperCase();
      return id === 'INDIAVIX' || id === 'INDIA VIX' || id.includes('VIX');
    });

    // Process all indices with correct field mapping
    // Dhan API Market Quote fields can be:
    // - securityId: symbol identifier
    // - LTP: Last Traded Price
    // - change: price change (absolute)
    // - changePercent: percentage change
    // - open, high, low, close: OHLC values
    // - previousClose: previous day's close
    
    const processedIndices = indices.map((idx, index) => {
      // Extract symbol/name
      const symbol = idx.securityId || idx.symbol || idx.name || idx.indexName || idx.instrument || `INDEX_${index}`;
      
      // Extract price - try multiple field names
      const lastPrice = idx.LTP || idx.lastPrice || idx.ltp || idx.close || idx.price || idx.currentPrice || 0;
      
      // Extract change - can be absolute change or calculated
      let change = idx.change || idx.changeValue || idx.priceChange || idx.netChange || 0;
      
      // Extract percentage change
      let pChange = idx.changePercent || idx.pChange || idx.percentChange || idx.changePercentage || 0;
      
      // If we have LTP and previousClose, calculate change
      if (!change && idx.previousClose && lastPrice) {
        change = parseFloat(lastPrice) - parseFloat(idx.previousClose);
      }
      
      // If we have change and previousClose, calculate percentage
      if (!pChange && idx.previousClose && change) {
        pChange = (parseFloat(change) / parseFloat(idx.previousClose)) * 100;
      }
      
      const processed = {
        symbol: String(symbol).trim(),
        lastPrice: parseFloat(lastPrice) || 0,
        change: parseFloat(change) || 0,
        pChange: parseFloat(pChange) || 0
      };
      
      // Log if we got zero values (might indicate wrong field mapping)
      if (processed.lastPrice === 0 && index < 3) {
        console.warn(`Index ${index} (${symbol}) has zero price. Raw data:`, JSON.stringify(idx));
      }
      
      return processed;
    });
    
    console.log(`Processed ${processedIndices.length} indices`);
    console.log('Sample processed indices (first 3):', processedIndices.slice(0, 3));

    // Calculate mood score
    const moodScore = calculateMoodFromDhan(indices);
    const mood = getMoodFromScore(moodScore);

    // Calculate market breadth from processed indices
    const advances = processedIndices.filter(idx => idx.pChange > 0).length;
    const declines = processedIndices.filter(idx => idx.pChange < 0).length;

    return {
      mood: mood,
      indices: processedIndices,
      vix: vix ? {
        last: parseFloat(vix.LTP || vix.lastPrice || vix.close || 0),
        change: parseFloat(vix.change || vix.changeValue || 0),
        pChange: parseFloat(vix.changePercent || vix.pChange || 0)
      } : {
        last: 0,
        change: 0,
        pChange: 0
      },
      advanceDecline: {
        advances: advances,
        declines: declines
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error('Error processing Dhan data: ' + error.message);
  }
}

function calculateMoodFromDhan(indices) {
  let score = 50;
  
  // Find NIFTY 50 by securityId or symbol
  const nifty50 = indices.find(idx => {
    const id = (idx.securityId || idx.symbol || idx.name || '').toString().toUpperCase();
    return id === 'NIFTY' || id === 'NIFTY 50' || id.includes('NIFTY50') || id === 'NIFTY_50';
  });

  if (!nifty50) {
    console.log('NIFTY 50 not found in indices');
    return score;
  }

  const pChange = parseFloat(nifty50.changePercent || nifty50.pChange || 0);

  // NIFTY 50 performance
  if (pChange > 0.5) score += 20;
  else if (pChange < -0.5) score -= 20;
  else if (pChange > 0.1) score += 10;
  else if (pChange < -0.1) score -= 10;

  // Market breadth
  const advances = indices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || idx.pChange || 0);
    return pChange > 0;
  }).length;
  const declines = indices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || idx.pChange || 0);
    return pChange < 0;
  }).length;

  if (advances > declines * 1.5) score += 15;
  else if (declines > advances * 1.5) score -= 15;

  // Consider major indices
  const majorIndices = indices.filter(idx => {
    const name = (idx.securityId || idx.symbol || idx.name || '').toString().toUpperCase();
    return name.includes('BANK') || name.includes('IT') || name.includes('NEXT');
  });

  const positiveCount = majorIndices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || idx.pChange || 0);
    return pChange > 0;
  }).length;
  const negativeCount = majorIndices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || idx.pChange || 0);
    return pChange < 0;
  }).length;

  if (positiveCount > negativeCount * 1.5) score += 5;
  else if (negativeCount > positiveCount * 1.5) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function getMoodFromScore(score) {
  if (score >= 80) return { score, text: 'Extremely Bullish 🚀', emoji: '🚀' };
  if (score >= 70) return { score, text: 'Very Bullish 📈', emoji: '📈' };
  if (score >= 60) return { score, text: 'Bullish 😊', emoji: '😊' };
  if (score >= 50) return { score, text: 'Slightly Bullish 🙂', emoji: '🙂' };
  if (score >= 40) return { score, text: 'Neutral 😐', emoji: '😐' };
  if (score >= 30) return { score, text: 'Slightly Bearish 🙁', emoji: '🙁' };
  if (score >= 20) return { score, text: 'Bearish 😟', emoji: '😟' };
  if (score >= 10) return { score, text: 'Very Bearish 📉', emoji: '📉' };
  return { score, text: 'Extremely Bearish 🐻', emoji: '🐻' };
}

function checkMarketStatusFromDhan(data) {
  // Check if data is recent and has valid prices
  const indices = Array.isArray(data) ? data : (data.data || data.indices || []);
  
  if (indices.length === 0) return false;

  // Check if we have valid prices (not all zeros)
  const hasValidPrices = indices.some(idx => 
    (idx.lastPrice || idx.close || idx.LTP) > 0
  );

  // Check if data is recent (if timestamp available)
  // For now, assume if we have valid data, market might be open
  // This is a simplified check - you can enhance based on Dhan API response

  return hasValidPrices;
}

