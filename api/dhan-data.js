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
    let clientId, accessToken, customEndpoint;
    
    if (req.method === 'POST' && req.body) {
      clientId = req.body.clientId;
      accessToken = req.body.accessToken;
      customEndpoint = req.body.customEndpoint;
    } else if (req.query) {
      clientId = req.query.clientId;
      accessToken = req.query.accessToken;
      customEndpoint = req.query.customEndpoint;
    }
    
    // Fallback to environment variables
    clientId = clientId || process.env.DHAN_CLIENT_ID;
    accessToken = accessToken || process.env.DHAN_ACCESS_TOKEN;
    customEndpoint = customEndpoint || process.env.DHAN_CUSTOM_ENDPOINT;

    if (!accessToken) {
      throw new Error('Dhan API access token not provided. Please configure in settings.');
    }

    console.log('Fetching data from Dhan API...');

    // Dhan API v2 - Based on documentation: https://dhanhq.co/docs/v2/
    // Try multiple base URLs
    const baseUrls = [
      'https://api.dhan.co',
      'https://api.dhanhq.co',
      'https://dhan.co/api',
      'https://dhanhq.co/api'
    ];
    
    const headers = {
      'access-token': accessToken,
      'Content-Type': 'application/json'
    };

    // If custom endpoint provided, use it first
    let endpoints = [];
    if (customEndpoint && customEndpoint.trim()) {
      endpoints = [customEndpoint.trim()];
    } else {
      // Based on Dhan API v2 documentation - Market Quote API endpoints
      endpoints = [
        '/market-quote/indices',           // Primary market quote endpoint (most likely)
        '/market-quote/index',             // Singular form
        '/market-quote',                   // Base market quote
        '/v2/market-quote/indices',        // With v2 prefix
        '/v2/market-quote/index',          // With v2 prefix singular
        '/indices',                        // Direct indices endpoint
        '/master/indices',                 // Master data indices
        '/master/index',                   // Master data index
        '/v2/indices',                     // v2 indices
        '/v2/index',                       // v2 index
        '/api/market-quote/indices',       // With api prefix
        '/api/indices'                     // With api prefix
      ];
    }

    let indicesResponse = null;
    let indicesData = null;
    let lastError = null;
    let workingEndpoint = null;
    let workingBaseUrl = null;

    // Try each base URL with each endpoint
    for (const testBaseUrl of baseUrls) {
      for (const endpoint of endpoints) {
        try {
          const fullUrl = `${testBaseUrl}${endpoint}`;
          console.log(`Trying Dhan API: ${fullUrl}`);
          
          const response = await fetch(fullUrl, {
            headers: headers,
            timeout: 10000
          });

          if (response.ok) {
            indicesResponse = response;
            indicesData = await response.json();
            workingEndpoint = endpoint;
            workingBaseUrl = testBaseUrl;
            console.log(`Successfully connected to Dhan API: ${fullUrl}`);
            break;
          } else if (response.status === 401 || response.status === 403) {
            // Auth error - endpoint exists but credentials wrong
            return res.status(200).json({
              error: true,
              message: `Authentication failed (${response.status}). Your access token might be expired.`,
              hint: 'Dhan API access tokens are valid for 24 hours only. Generate a new token from Dhan dashboard.',
              suggestion: 'Visit https://dhanhq.co/docs/v2/ to learn how to generate a new access token.',
              marketStatus: {
                isOpen: false,
                verified: false,
                reason: 'AUTH_FAILED',
                timestamp: new Date().toISOString()
              }
            });
          } else if (response.status !== 404) {
            // Other error - might be rate limit or other issue
            lastError = `Status ${response.status} at ${endpoint}`;
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
        hint: `Please check Dhan API documentation at https://dhanhq.co/docs/v2/ for the correct endpoint.`,
        testedEndpoints: endpoints,
        suggestion: 'The endpoint might require a different base URL, authentication method, or your account might not have access to this endpoint. Please verify your Dhan API credentials and documentation.',
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

