const fetch = require('node-fetch');

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
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  try {
    const { clientId, accessToken, customEndpoint } = req.body;

    if (!clientId || !accessToken) {
      return res.status(200).json({
        success: false,
        message: 'Client ID and Access Token are required'
      });
    }

    console.log('Testing Dhan API connection...');

    // Test Dhan API connection
    // Based on Dhan API v2 documentation: https://dhanhq.co/docs/v2/
    // Dhan API v2 uses: https://api.dhan.co as base URL
    const baseUrl = 'https://api.dhan.co';
    const headers = {
      'access-token': accessToken,
      'Content-Type': 'application/json'
    };

    // Also try alternative base URLs if main one fails
    const baseUrls = [
      'https://api.dhan.co',
      'https://api.dhanhq.co',
      'https://dhan.co/api',
      'https://dhanhq.co/api'
    ];

    // If custom endpoint provided, use it first
    let endpoints = [];
    if (customEndpoint && customEndpoint.trim()) {
      endpoints = [customEndpoint.trim()];
    } else {
      // Based on Dhan API v2 documentation: https://dhanhq.co/docs/v2/
      // Market Quote API endpoints for indices
      endpoints = [
        '/market-quote/indices',           // Primary market quote endpoint (most likely)
        '/market-quote/index',             // Singular form
        '/market-quote',                   // Base market quote (might need params)
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

    let testResponse = null;
    let lastError = null;
    let workingEndpoint = null;
    let workingBaseUrl = null;

    // Try each base URL with each endpoint
    for (const testBaseUrl of baseUrls) {
      for (const endpoint of endpoints) {
        try {
          const fullUrl = `${testBaseUrl}${endpoint}`;
          console.log(`Trying: ${fullUrl}`);
          
          const response = await fetch(fullUrl, {
            headers: headers,
            timeout: 10000
          });

          if (response.ok) {
            testResponse = response;
            workingEndpoint = endpoint;
            workingBaseUrl = testBaseUrl;
            break;
          } else if (response.status === 401 || response.status === 403) {
            // Auth error - endpoint exists but credentials wrong
            return res.status(200).json({
              success: false,
              message: `Authentication failed (${response.status}). Please check your access token.`,
              hint: `Endpoint found: ${endpoint}, but authentication failed. Your token might be expired (tokens are valid for 24 hours).`,
              endpoint: endpoint,
              baseUrl: testBaseUrl
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
      
      if (testResponse) break; // Found working endpoint, stop searching
    }

    if (!testResponse) {
      // If all endpoints failed, try a simpler test - check if token is valid
      // by trying common authentication endpoints
      const authEndpoints = ['/user/profile', '/account', '/auth/verify', '/v2/user/profile'];
      
      for (const authEndpoint of authEndpoints) {
        try {
          const authResponse = await fetch(`${baseUrls[0]}${authEndpoint}`, {
            headers: headers,
            timeout: 10000
          });
          
          if (authResponse.status === 401 || authResponse.status === 403) {
            // Auth endpoint exists but credentials wrong
            return res.status(200).json({
              success: false,
              message: 'Invalid or expired access token. Please check your credentials.',
              hint: `Access tokens are valid for 24 hours only. Generate a new token from Dhan dashboard. Endpoint found: ${authEndpoint}`,
              suggestion: 'Visit https://dhanhq.co/docs/v2/ to learn how to generate a new access token.'
            });
          } else if (authResponse.ok) {
            // Token is valid but indices endpoint not found
            return res.status(200).json({
              success: false,
              message: 'Token is valid but indices endpoint not found.',
              hint: `Your credentials work, but the indices endpoint might be different. Check Dhan API v2 documentation: https://dhanhq.co/docs/v2/`,
              suggestion: 'Try entering a custom endpoint in the settings. Common formats: /market-quote/indices, /indices, /master/indices'
            });
          }
        } catch (e) {
          continue;
        }
      }

      return res.status(200).json({
        success: false,
        message: `Dhan API endpoints not found (404). All tested endpoints returned 404.`,
        hint: `Please check Dhan API v2 documentation: https://dhanhq.co/docs/v2/`,
        testedEndpoints: endpoints,
        testedBaseUrls: baseUrls,
        suggestion: `1. Verify your access token is valid (tokens expire after 24 hours)\n2. Check Dhan API v2 documentation for correct endpoint\n3. Try entering a custom endpoint manually\n4. Ensure your account has API access enabled`
      });
    }

    const data = await testResponse.json();
    return res.status(200).json({
      success: true,
      message: 'Dhan API connection successful',
      dataCount: Array.isArray(data) ? data.length : (data.data?.length || 0),
      endpoint: workingEndpoint,
      baseUrl: workingBaseUrl,
      note: 'Save this endpoint for future use'
    });

  } catch (error) {
    console.error('Dhan API test error:', error);
    return res.status(200).json({
      success: false,
      message: error.message || 'Failed to connect to Dhan API'
    });
  }
};

