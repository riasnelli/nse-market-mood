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
            // Common indices to request
            const requestBody = {
              securityId: ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY PHARMA', 'NIFTY AUTO', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY REALTY', 'NIFTY PSU BANK', 'NIFTY PRIVATE BANK', 'NIFTY ENERGY', 'NIFTY INFRA', 'NIFTY MIDCAP 50', 'NIFTY SMLCAP 50', 'NIFTY 100'],
              ...(clientId && { clientId })
            };
            fetchOptions.body = JSON.stringify(requestBody);
          }
          
          const response = await fetch(fullUrl, fetchOptions);

          if (response.ok) {
            indicesResponse = response;
            indicesData = await response.json();
            workingEndpoint = endpoint;
            console.log(`Successfully connected to Dhan API: ${fullUrl}`);
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
    
    // Process Dhan API response
    const processedData = processDhanData(indicesData);
    
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
    
    // Return error response
    res.status(200).json({
      error: true,
      message: error.message,
      note: 'Dhan API failed - check credentials',
      marketStatus: {
        isOpen: false,
        verified: false,
        reason: 'API_ERROR',
        timestamp: new Date().toISOString()
      }
    });
  }
};

function processDhanData(data) {
  try {
    // Dhan API returns indices in different format
    // Adjust based on actual Dhan API response structure
    const indices = Array.isArray(data) ? data : (data.data || data.indices || []);
    
    // Find key indices
    const nifty50 = indices.find(idx => 
      idx.symbol === 'NIFTY' || 
      idx.name?.includes('NIFTY 50') ||
      idx.indexName === 'NIFTY 50'
    );
    
    const bankNifty = indices.find(idx => 
      idx.symbol === 'BANKNIFTY' ||
      idx.name?.includes('BANK NIFTY') ||
      idx.indexName === 'NIFTY BANK'
    );

    const vix = indices.find(idx => 
      idx.symbol === 'INDIAVIX' ||
      idx.name?.includes('VIX') ||
      idx.indexName === 'INDIA VIX'
    );

    // Process all indices
    const processedIndices = indices.map(idx => ({
      symbol: idx.symbol || idx.indexName || idx.name,
      lastPrice: idx.lastPrice || idx.close || idx.LTP || 0,
      change: idx.change || idx.changeValue || 0,
      pChange: idx.changePercent || idx.pChange || 0
    }));

    // Calculate mood score
    const moodScore = calculateMoodFromDhan(indices);
    const mood = getMoodFromScore(moodScore);

    // Calculate market breadth
    const advances = indices.filter(idx => (idx.changePercent || idx.pChange || 0) > 0).length;
    const declines = indices.filter(idx => (idx.changePercent || idx.pChange || 0) < 0).length;

    return {
      mood: mood,
      indices: processedIndices,
      vix: vix ? {
        last: vix.lastPrice || vix.close || 0,
        change: vix.change || 0,
        pChange: vix.changePercent || 0
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
  
  // Find NIFTY 50
  const nifty50 = indices.find(idx => 
    idx.symbol === 'NIFTY' || 
    idx.name?.includes('NIFTY 50') ||
    idx.indexName === 'NIFTY 50'
  );

  if (!nifty50) return score;

  const pChange = nifty50.changePercent || nifty50.pChange || 0;

  // NIFTY 50 performance
  if (pChange > 0.5) score += 20;
  else if (pChange < -0.5) score -= 20;
  else if (pChange > 0.1) score += 10;
  else if (pChange < -0.1) score -= 10;

  // Market breadth
  const advances = indices.filter(idx => (idx.changePercent || idx.pChange || 0) > 0).length;
  const declines = indices.filter(idx => (idx.changePercent || idx.pChange || 0) < 0).length;

  if (advances > declines * 1.5) score += 15;
  else if (declines > advances * 1.5) score -= 15;

  // Consider major indices
  const majorIndices = indices.filter(idx => {
    const name = (idx.symbol || idx.name || '').toUpperCase();
    return name.includes('BANK') || name.includes('IT') || name.includes('NEXT');
  });

  const positiveCount = majorIndices.filter(idx => (idx.changePercent || idx.pChange || 0) > 0).length;
  const negativeCount = majorIndices.filter(idx => (idx.changePercent || idx.pChange || 0) < 0).length;

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

