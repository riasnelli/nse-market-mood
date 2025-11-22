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
    const baseUrl = 'https://api.dhan.co';
    const headers = {
      'access-token': accessToken,
      'Content-Type': 'application/json'
    };

    // If custom endpoint provided, use it first
    let endpoints = [];
    if (customEndpoint && customEndpoint.trim()) {
      endpoints = [customEndpoint.trim()];
    } else {
      // Try multiple possible endpoints based on Dhan API v2 documentation
      endpoints = [
        '/v2/market-quote/indices',  // Dhan API v2 market quote endpoint
        '/v2/indices',               // Dhan API v2 indices
        '/market-quote/indices',     // Alternative format
        '/indices',                  // Simple format
        '/market/indices',           // Market endpoint
        '/v1/indices',              // v1 format
        '/api/indices',              // API prefix
        '/master/indices'            // Master data
      ];
    }

    let testResponse = null;
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          headers: headers,
          timeout: 10000
        });

        if (response.ok) {
          testResponse = response;
          break;
        } else if (response.status !== 404) {
          // If it's not 404, it might be auth error - try next endpoint
          lastError = `Status ${response.status}`;
        }
      } catch (error) {
        lastError = error.message;
        continue;
      }
    }

    if (!testResponse) {
      // If all endpoints failed, try a simpler test - just check if token is valid
      // by trying to get user profile or account info
      try {
        const profileResponse = await fetch(`${baseUrl}/user/profile`, {
          headers: headers,
          timeout: 10000
        });
        
        if (profileResponse.ok || profileResponse.status === 401) {
          // 401 means endpoint exists but auth might be wrong
          return res.status(200).json({
            success: false,
            message: 'Invalid access token. Please check your credentials.',
            hint: 'The API endpoint exists but authentication failed.'
          });
        }
      } catch (e) {
        // Ignore
      }

      return res.status(200).json({
        success: false,
        message: `Dhan API endpoints not found (404). All tested endpoints returned 404.`,
        hint: `Please check Dhan API documentation at https://dhanhq.co/docs/v2/ for the correct endpoint. Tried: ${endpoints.join(', ')}`,
        testedEndpoints: endpoints,
        suggestion: 'The endpoint might require a different base URL or authentication method. Please verify your Dhan API credentials and documentation.'
      });
    }

    const data = await testResponse.json();
    return res.status(200).json({
      success: true,
      message: 'Dhan API connection successful',
      dataCount: Array.isArray(data) ? data.length : (data.data?.length || 0),
      endpoint: 'Working endpoint found'
    });

  } catch (error) {
    console.error('Dhan API test error:', error);
    return res.status(200).json({
      success: false,
      message: error.message || 'Failed to connect to Dhan API'
    });
  }
};

