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

    // Dhan API - Base URL per documentation: https://api.dhan.co/v2/
    // According to Dhan API v2 docs, base URL is https://api.dhan.co/v2/
    // Try different base URL formats
    const baseUrls = [
      'https://api.dhan.co/v2',           // v2 base URL (from official docs)
      'https://api.dhan.co',              // Non-v2 base URL
      'https://api.dhan.co/v2/',          // v2 with trailing slash
      'https://dhan.co/api/v2'            // Alternative format
    ];
    
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

    // Step 1: Try to get indices list first (based on user's Python code)
    console.log('Step 1: Fetching indices list from Dhan API...');
    let securityIds = [];
    let indicesList = [];
    
    // Try /indices endpoint (from user's code)
    // Also try with /v2/ prefix in case base URL doesn't include it
    for (const testBaseUrl of baseUrls) {
      const indicesEndpoints = [
        '/indices',
        '/v2/indices',
        'indices',
        'v2/indices'
      ];
      
      for (const indicesEndpoint of indicesEndpoints) {
        try {
          // Handle endpoint with or without leading slash
          let cleanEndpoint = indicesEndpoint.startsWith('/') ? indicesEndpoint : '/' + indicesEndpoint;
          // Remove /v2/ prefix if baseUrl already has it
          if (testBaseUrl.includes('/v2') && cleanEndpoint.startsWith('/v2/')) {
            cleanEndpoint = cleanEndpoint.substring(3);
          }
          const indicesUrl = `${testBaseUrl}${cleanEndpoint}`;
          console.log(`Trying indices endpoint: ${indicesUrl}`);
          
          const indicesResponse = await fetch(indicesUrl, {
            method: 'GET',
            headers: headers,
            timeout: 10000
          });
          
          console.log(`Indices endpoint response: ${indicesResponse.status} ${indicesResponse.statusText}`);
          
          if (indicesResponse.ok) {
            const indicesData = await indicesResponse.json();
            console.log('Indices response sample:', JSON.stringify(indicesData).substring(0, 1000));
            
            // Extract indices list
            if (Array.isArray(indicesData)) {
              indicesList = indicesData;
            } else if (indicesData.data && Array.isArray(indicesData.data)) {
              indicesList = indicesData.data;
            } else if (indicesData.result && Array.isArray(indicesData.result)) {
              indicesList = indicesData.result;
            }
            
            if (indicesList.length > 0) {
              console.log(`✅ Found ${indicesList.length} indices in list`);
              // Extract securityIds if available
              const niftyIndices = indicesList.filter(inst => {
                const name = (inst.name || inst.symbol || inst.securityId || inst.instrumentName || '').toString().toUpperCase();
                return name.includes('NIFTY') || name.includes('VIX');
              });
              securityIds = niftyIndices.map(inst => inst.securityId || inst.instrumentId || inst.id || inst.security_id);
              securityIds = securityIds.filter(id => id);
              if (securityIds.length > 0) {
                console.log(`✅ Found ${securityIds.length} securityIds:`, securityIds.slice(0, 5));
              }
            }
          } else if (indicesResponse.status !== 404) {
            // Log non-404 errors for debugging
            const errorText = await indicesResponse.text().catch(() => '');
            console.log(`Indices endpoint returned ${indicesResponse.status}: ${errorText.substring(0, 200)}`);
          }
          
        } catch (e) {
          console.log(`Indices endpoint failed for ${testBaseUrl}${indicesEndpoint}:`, e.message);
        }
        
        // If we found data, break out of endpoint loop
        if (indicesList.length > 0) {
          break;
        }
      }
      
      // If we found data, break out of baseUrl loop
      if (indicesList.length > 0) break;
    }
    
    // If we couldn't get indices list, use fallback
    if (indicesList.length === 0) {
      console.warn('⚠️ Could not fetch indices list. Will try direct quotes API.');
    }

    // If custom endpoint provided, use it first
    let endpoints = [];
    if (customEndpoint && customEndpoint.trim()) {
      const cleanEndpoint = customEndpoint.trim().startsWith('/') 
        ? customEndpoint.trim() 
        : '/' + customEndpoint.trim();
      endpoints = [cleanEndpoint];
    } else {
      // Based on Dhan API v2 documentation
      // Note: baseUrl already includes /v2, so endpoints should NOT start with /v2/
      endpoints = [
        // Market Quote API endpoints (POST) - these are the main ones
        '/marketfeed/ltp',                 // Last Traded Price
        '/marketfeed/ohlc',                // OHLC data
        '/marketfeed/quote',               // Full quote
        // Instruments/Master Data endpoints (GET) - to get securityIds
        '/instruments/indices',            // Instruments for indices
        '/master/indices',                 // Master data for indices
        '/instruments',                    // All instruments
        '/master',                         // Master data
        // Alternative endpoints (if above don't work)
        '/quotes',                         // Quotes endpoint
        '/indices'                         // Indices list
      ];
    }

    let indicesResponse = null;
    let indicesData = null;
    let lastError = null;
    let workingEndpoint = null;

    // Try each endpoint with POST method (as per Dhan API v2 docs)
    // Market Quote APIs use POST with request body
    // Try multiple request formats for each endpoint
    const symbols = [
      'NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY PHARMA', 
      'NIFTY AUTO', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY REALTY', 
      'NIFTY PSU BANK', 'NIFTY PRIVATE BANK', 'NIFTY ENERGY', 
      'NIFTY INFRA', 'NIFTY MIDCAP 50', 'NIFTY SMLCAP 50', 
      'NIFTY 100', 'INDIA VIX'
    ];
    
    // Define request formats to try
    const requestFormats = securityIds.length > 0 
      ? [
          { name: 'NSE_INDEX_numeric', body: { 'NSE_INDEX': securityIds.slice(0, 15) } },
          { name: 'INDEX_numeric', body: { 'INDEX': securityIds.slice(0, 15) } },
          { name: 'array_numeric', body: { securityId: securityIds.slice(0, 15) } }
        ]
      : [
          { name: 'NSE_INDEX_symbols', body: { 'NSE_INDEX': symbols } },
          { name: 'INDEX_symbols', body: { 'INDEX': symbols } },
          { name: 'array_symbols', body: { securityId: symbols } },
          { name: 'objectArray', body: { securityId: symbols.map(s => ({ securityId: s, exchangeSegment: 'INDEX' })) } }
        ];
    
    // Try each base URL
    for (const baseUrl of baseUrls) {
      for (const endpoint of endpoints) {
        for (const method of ['GET', 'POST']) {
          // For GET /quotes endpoint, try with query parameters (from user's Python code)
          if (method === 'GET' && endpoint === '/quotes') {
            // Try fetching quotes for each index symbol individually
            const symbols = [
              'NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY PHARMA', 
              'NIFTY AUTO', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY REALTY', 
              'NIFTY PSU BANK', 'NIFTY PRIVATE BANK', 'NIFTY ENERGY', 
              'NIFTY INFRA', 'NIFTY MIDCAP 50', 'NIFTY SMLCAP 50', 
              'NIFTY 100', 'INDIA VIX'
            ];
            
            try {
              const quotesData = [];
              for (const symbol of symbols) {
                try {
                  const fullUrl = `${baseUrl}${endpoint}?symbol=${encodeURIComponent(symbol)}`;
                  console.log(`Trying GET quotes for ${symbol}: ${fullUrl}`);
                  
                  const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: headers,
                    timeout: 10000
                  });
                  
                  if (response.ok) {
                    const quoteData = await response.json();
                    console.log(`GET /quotes response for ${symbol}:`, JSON.stringify(quoteData).substring(0, 500));
                    if (quoteData && (quoteData.lastPrice || quoteData.data || quoteData.LTP)) {
                      quotesData.push({
                        symbol: symbol,
                        ...quoteData
                      });
                      console.log(`✅ Got quote for ${symbol}`);
                    } else {
                      console.log(`⚠️ GET /quotes returned empty data for ${symbol}`);
                    }
                  } else {
                    const errorText = await response.text().catch(() => '');
                    console.log(`GET /quotes failed for ${symbol}: ${response.status} - ${errorText.substring(0, 200)}`);
                  }
                } catch (e) {
                  console.log(`Failed to get quote for ${symbol}:`, e.message);
                }
              }
              
              if (quotesData.length > 0) {
                indicesData = { data: quotesData, status: 'success' };
                workingEndpoint = endpoint;
                console.log(`✅ Successfully fetched ${quotesData.length} quotes using GET /quotes`);
                break;
              }
            } catch (e) {
              console.log(`GET /quotes failed:`, e.message);
            }
          }
          
          // For POST, try each request format; for GET (non-quotes), try once
          const formatsToTry = (method === 'POST') ? requestFormats : [null];
          
          for (const reqFormat of formatsToTry) {
            try {
              // Ensure endpoint doesn't start with /v2/ if baseUrl already has it
              let cleanEndpoint = endpoint;
              if (baseUrl.includes('/v2') && endpoint.startsWith('/v2/')) {
                cleanEndpoint = endpoint.substring(3); // Remove /v2 prefix
              }
              const fullUrl = `${baseUrl}${cleanEndpoint}`;
              console.log(`Trying Dhan API ${method}: ${fullUrl}${reqFormat ? ` (format: ${reqFormat.name})` : ''}`);
              
              const fetchOptions = {
                method: method,
                headers: headers,
                timeout: 10000
              };
              
              // For POST requests, include request body
              if (method === 'POST' && reqFormat) {
                fetchOptions.body = JSON.stringify(reqFormat.body);
                console.log(`📤 Request body (${reqFormat.name}):`, JSON.stringify(reqFormat.body).substring(0, 300));
              }
            
            const response = await fetch(fullUrl, fetchOptions);

            if (response.ok) {
              const responseData = await response.json();
              console.log(`✅ Response received from ${fullUrl}${reqFormat ? ` (${reqFormat.name})` : ''}`);
              console.log(`Response type: ${typeof responseData}, Is Array: ${Array.isArray(responseData)}`);
              console.log(`Response keys: ${Object.keys(responseData || {}).join(', ')}`);
              console.log(`Sample response: ${JSON.stringify(responseData).substring(0, 2000)}`);
              
              // Check if response has actual data (not empty)
              const hasData = (responseData.data && Object.keys(responseData.data || {}).length > 0) ||
                            Array.isArray(responseData) ||
                            (responseData.data && Array.isArray(responseData.data)) ||
                            (typeof responseData === 'object' && Object.keys(responseData).some(k => k !== 'status' && k !== 'data'));
              
              if (hasData) {
                indicesResponse = response;
                indicesData = responseData;
                workingEndpoint = endpoint;
                console.log(`✅ Successfully connected to Dhan API with data: ${fullUrl} (format: ${reqFormat?.name || 'GET'})`);
                break;
              } else {
                console.log(`⚠️ Response OK but data is empty, trying next format...`);
                // Continue to next format
                continue;
              }
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
            
            // If we found data, break out of format loop
            if (indicesData) break;
          }
          
          // If we found data, break out of method loop
          if (indicesData) break;
        }
        
        // If we found data, break out of endpoint loop
        if (indicesData) break;
      }
      
      // If we found data, break out of baseUrl loop
      if (indicesData) break;
    }

    if (!indicesData) {
      // Return a helpful error message with detailed debugging info
      console.log('❌ All endpoints failed. Last error:', lastError);
      console.log('Tested base URLs:', baseUrls);
      console.log('Tested endpoints:', endpoints);
      console.log('Headers used:', JSON.stringify(headers).replace(/access-token":"[^"]+/, 'access-token":"***'));
      
      return res.status(200).json({
        error: true,
        message: `Dhan API endpoints not found. All tested endpoints returned 404.`,
        hint: `Dhan API endpoints are responding but returning empty data. This usually means:\n1. The API requires numeric securityIds, not symbol names\n2. You need to use the Instruments API to get securityIds first\n3. Check Dhan API v2 documentation for the correct Instruments endpoint`,
        testedBaseUrls: baseUrls,
        testedEndpoints: endpoints,
        lastError: lastError || 'All endpoints returned empty data (data: {})',
        suggestion: `The Dhan API is responding with {"data":{},"status":"success"} which means:\n\n✅ Authentication is working\n❌ But securityId format is incorrect\n\n💡 Solution:\n1. Dhan API requires NUMERIC securityIds, not symbol names like "NIFTY 50"\n2. You need to call the Instruments API first to get numeric IDs\n3. Check Dhan API v2 docs for: /instruments or /master endpoints\n4. Or manually provide numeric securityIds in the custom endpoint field\n\n📚 Documentation: https://dhanhq.co/docs/v2/\n🔗 Subscription: https://web.dhan.co → My Profile → DhanHQ Trading APIs`,
        helpLinks: {
          docs: 'https://dhanhq.co/docs/v2/',
          subscription: 'https://web.dhan.co',
          support: 'mailto:help@dhan.co'
        },
        debugInfo: {
          hasClientId: !!clientId,
          hasAccessToken: !!accessToken,
          hasApiKey: !!apiKey,
          hasApiSecret: !!apiSecret,
          customEndpoint: customEndpoint || 'none'
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
    // 2. Object with data property: {data: [{...}, ...]} or {data: [{symbol: 'NIFTY 50', lastPrice: ...}, ...]} (from GET /quotes)
    // 3. Object with keys as securityIds: {'NIFTY 50': {LTP: 21500, ...}, ...}
    // 4. Object with nested structure: {result: [{...}, ...]}
    // 5. Single quote object from GET /quotes: {lastPrice: 21500, change: 100, pChange: 0.5, ...}
    
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
      } else if (data.lastPrice !== undefined || data.LTP !== undefined) {
        // Single quote object from GET /quotes endpoint (from user's Python code)
        // Wrap it in an array
        indices = [data];
        console.log('Using single quote object (GET /quotes format), wrapped in array');
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
    
    // Dhan API Market Quote fields (from user's Python code and docs):
    // - securityId or symbol: symbol identifier
    // - LTP or lastPrice: Last Traded Price
    // - change: price change
    // - pChange or changePercent: percentage change
    // - highPrice or dayHigh: high price
    // - lowPrice or dayLow: low price
    // - totalTradedVolume or volume: volume
    
    // Process each index to normalize field names
    const processedIndices = indices.map(idx => {
      const symbol = idx.symbol || idx.securityId || idx.name || '';
      return {
        symbol: symbol,
        name: symbol,
        lastPrice: idx.lastPrice || idx.LTP || idx.close || idx.price || 0,
        change: idx.change || (idx.lastPrice && idx.close ? idx.lastPrice - idx.close : 0) || 0,
        changePercent: idx.pChange || idx.changePercent || idx.changePercent || 0,
        dayHigh: idx.dayHigh || idx.highPrice || idx.high || 0,
        dayLow: idx.dayLow || idx.lowPrice || idx.low || 0,
        volume: idx.volume || idx.totalTradedVolume || idx.tradedVolume || 0,
        open: idx.open || idx.openPrice || 0,
        close: idx.close || idx.closePrice || idx.lastPrice || 0,
        raw: idx // Keep raw data for debugging
      };
    });
    
    // Find key indices by securityId or symbol
    const nifty50 = processedIndices.find(idx => {
      const id = (idx.symbol || idx.name || '').toString().toUpperCase();
      return id === 'NIFTY' || id === 'NIFTY 50' || id.includes('NIFTY50') || id === 'NIFTY_50';
    });
    
    const bankNifty = processedIndices.find(idx => {
      const id = (idx.symbol || idx.name || '').toString().toUpperCase();
      return id === 'BANKNIFTY' || id === 'NIFTY BANK' || id.includes('BANKNIFTY') || id === 'NIFTY_BANK';
    });

    const vix = processedIndices.find(idx => {
      const id = (idx.symbol || idx.name || '').toString().toUpperCase();
      return id === 'INDIAVIX' || id === 'INDIA VIX' || id.includes('VIX');
    });

    console.log(`Processed ${processedIndices.length} indices`);
    console.log('Sample processed indices (first 3):', processedIndices.slice(0, 3));

    // Calculate mood score from processed indices
    const moodScore = calculateMoodFromDhan(processedIndices);
    const mood = getMoodFromScore(moodScore);

    // Calculate market breadth from processed indices
    const advances = processedIndices.filter(idx => idx.changePercent > 0).length;
    const declines = processedIndices.filter(idx => idx.changePercent < 0).length;

    // Get NIFTY 50 data for mood calculation
    const nifty50Data = nifty50 ? {
      last: nifty50.lastPrice,
      change: nifty50.change,
      changePercent: nifty50.changePercent
    } : {
      last: 0,
      change: 0,
      changePercent: 0
    };

    return {
      mood: moodScore,
      nifty50: nifty50Data,
      indices: processedIndices.map(idx => ({
        symbol: idx.symbol,
        name: idx.name,
        lastPrice: idx.lastPrice,
        change: idx.change,
        changePercent: idx.changePercent,
        dayHigh: idx.dayHigh,
        dayLow: idx.dayLow,
        volume: idx.volume
      })),
      vix: vix ? {
        last: vix.lastPrice,
        change: vix.change,
        pChange: vix.changePercent
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

  const pChange = parseFloat(nifty50.changePercent || 0);

  // NIFTY 50 performance
  if (pChange > 0.5) score += 20;
  else if (pChange < -0.5) score -= 20;
  else if (pChange > 0.1) score += 10;
  else if (pChange < -0.1) score -= 10;

  // Market breadth
  const advances = processedIndices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || 0);
    return pChange > 0;
  }).length;
  const declines = processedIndices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || 0);
    return pChange < 0;
  }).length;

  if (advances > declines * 1.5) score += 15;
  else if (declines > advances * 1.5) score -= 15;

  // Consider major indices
  const majorIndices = processedIndices.filter(idx => {
    const name = (idx.symbol || idx.name || '').toString().toUpperCase();
    return name.includes('BANK') || name.includes('IT') || name.includes('NEXT');
  });

  const positiveCount = majorIndices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || 0);
    return pChange > 0;
  }).length;
  const negativeCount = majorIndices.filter(idx => {
    const pChange = parseFloat(idx.changePercent || 0);
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

