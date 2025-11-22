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
    const baseUrl = 'https://api.dhan.co';
    const headers = {
      'access-token': accessToken,
      'Content-Type': 'application/json'
    };

    // Try to fetch indices as a test
    const testResponse = await fetch(`${baseUrl}/indices`, {
      headers: headers,
      timeout: 10000
    });

    if (testResponse.ok) {
      const data = await testResponse.json();
      return res.status(200).json({
        success: true,
        message: 'Dhan API connection successful',
        dataCount: Array.isArray(data) ? data.length : (data.data?.length || 0)
      });
    } else {
      return res.status(200).json({
        success: false,
        message: `Dhan API returned status ${testResponse.status}. Please check your credentials.`
      });
    }

  } catch (error) {
    console.error('Dhan API test error:', error);
    return res.status(200).json({
      success: false,
      message: error.message || 'Failed to connect to Dhan API'
    });
  }
};

