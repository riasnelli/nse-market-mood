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
    const { clientId, accessToken, apiKey, apiSecret, customEndpoint } = req.body;

    if (!accessToken) {
      return res.status(200).json({
        success: false,
        message: 'Access Token is required'
      });
    }
    
    // For v2.4+, API Key/Secret might be used instead of Client ID
    if (!clientId && !apiKey) {
      return res.status(200).json({
        success: false,
        message: 'Either Client ID or API Key is required'
      });
    }

    console.log('Testing Dhan API connection...');

    // Test Dhan API connection
    // Based on Dhan API v2 documentation: https://dhanhq.co/docs/v2/
    // Base URL: https://api.dhan.co/v2/ (with /v2/ prefix)
    const baseUrl = 'https://api.dhan.co/v2';
    const headers = {
      'access-token': accessToken,
      'Content-Type': 'application/json'
    };
    
    // Add Client ID if provided
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
      // Based on Dhan API v2 documentation: https://dhanhq.co/docs/v2/
      // Market Quote API endpoints under Data APIs section
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

    let testResponse = null;
    let lastError = null;
    let workingEndpoint = null;

    // Try each endpoint with POST method first (as per Dhan API v2 docs)
    // Market Quote APIs use POST with request body
    for (const endpoint of endpoints) {
      for (const method of ['POST', 'GET']) {
        try {
          const fullUrl = `${baseUrl}${endpoint}`;
          console.log(`Trying ${method}: ${fullUrl}`);
          
          const fetchOptions = {
            method: method,
            headers: headers,
            timeout: 10000
          };
          
          // For POST requests, include request body with indices
          if (method === 'POST') {
            // Common indices to request
            const requestBody = {
              securityId: ['NIFTY 50', 'NIFTY BANK'],
              ...(clientId && { clientId })
            };
            fetchOptions.body = JSON.stringify(requestBody);
          }
          
          const response = await fetch(fullUrl, fetchOptions);

          if (response.ok) {
            testResponse = response;
            workingEndpoint = endpoint;
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
              success: false,
              message: `Authentication failed (${response.status}). Please check your access token.`,
              hint: `Endpoint found: ${endpoint}, but authentication failed. Your token might be expired (tokens are valid for 24 hours).`,
              endpoint: endpoint,
              baseUrl: baseUrl,
              errorDetails: errorData
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
      
      if (testResponse) break; // Found working endpoint, stop searching
    }

    if (!testResponse) {
      // If all endpoints failed, try a simpler test - check if token is valid
      // by trying common authentication endpoints
      const authEndpoints = ['/user/profile', '/account', '/auth/verify'];
      
      for (const authEndpoint of authEndpoints) {
        try {
          const authResponse = await fetch(`${baseUrl}${authEndpoint}`, {
            headers: headers,
            timeout: 10000
          });
          
          if (authResponse.status === 401 || authResponse.status === 403) {
            // Auth endpoint exists but credentials wrong
            return res.status(200).json({
              success: false,
              message: 'Invalid or expired access token. Please check your credentials.',
              hint: `Access tokens are valid for 24 hours only. Generate a new token from Dhan dashboard. Endpoint found: ${authEndpoint}`,
              suggestion: 'Visit https://dhanhq.co/docs/v2/ to learn how to generate a new access token.',
              baseUrl: baseUrl
            });
          } else if (authResponse.ok) {
            // Token is valid but indices endpoint not found
            return res.status(200).json({
              success: false,
              message: 'Token is valid but indices endpoint not found.',
              hint: `Your credentials work, but the indices endpoint might be different. Check Dhan API v2 documentation: https://dhanhq.co/docs/v2/`,
              suggestion: 'Try entering a custom endpoint in the settings. Based on docs, try: /marketfeed/ltp, /marketfeed/ohlc, or /marketfeed/quote',
              baseUrl: baseUrl
            });
          }
        } catch (e) {
          continue;
        }
      }

      return res.status(200).json({
        success: false,
        message: `Dhan API endpoints not found (404). All tested endpoints returned 404.`,
        hint: `This usually means your account doesn't have Data API subscription or the endpoint is incorrect.`,
        testedEndpoints: endpoints,
        baseUrl: baseUrl,
        suggestion: `🔍 Troubleshooting Steps:\n\n1. Check Data API Subscription:\n   → Go to https://web.dhan.co\n   → Login → My Profile → DhanHQ Trading APIs\n   → Verify "Data API" subscription is ACTIVE\n\n2. Verify Access Token:\n   → Tokens expire after 24 hours\n   → Generate new token if expired\n   → Check token validity in Dhan dashboard\n\n3. Try Custom Endpoint:\n   → Check Dhan API v2 docs: https://dhanhq.co/docs/v2/\n   → Find exact endpoint for indices/market data\n   → Try: /marketfeed/ltp, /marketfeed/ohlc, or /marketfeed/quote\n   → Enter in "Custom Endpoint" field\n\n4. Contact Dhan Support:\n   → Email: help@dhan.co\n   → Phone: 9987761000\n   → Ask about Data API subscription status`,
        helpLinks: {
          docs: 'https://dhanhq.co/docs/v2/',
          subscription: 'https://web.dhan.co',
          support: 'mailto:help@dhan.co'
        }
      });
    }

    const data = await testResponse.json();
    return res.status(200).json({
      success: true,
      message: 'Dhan API connection successful',
      dataCount: Array.isArray(data) ? data.length : (data.data?.length || 0),
      endpoint: workingEndpoint,
      baseUrl: baseUrl,
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

