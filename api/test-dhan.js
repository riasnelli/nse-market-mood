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
    const { clientId, accessToken } = req.body;

    if (!clientId || !accessToken) {
      return res.status(200).json({
        success: false,
        message: 'Client ID and Access Token are required'
      });
    }

    console.log('Testing Dhan API connection...');

    // Test Dhan API connection
    // Dhan API might use different endpoints - try common ones
    const baseUrl = 'https://api.dhan.co';
    const headers = {
      'access-token': accessToken,
      'Content-Type': 'application/json'
    };

    // Try multiple possible endpoints
    const endpoints = [
      '/indices',
      '/market/indices',
      '/v1/indices',
      '/api/indices',
      '/master/indices'
    ];

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
        message: `Dhan API endpoints not found (404). Please verify the API endpoint URL or check Dhan API documentation.`,
        hint: 'Common endpoints: /indices, /market/indices, /v1/indices'
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

