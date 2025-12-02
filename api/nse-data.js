const fetch = require('node-fetch');

// Get NSE API base URL from query parameter, environment variable, or use default
function getNSEBaseUrl(req) {
  // First check query parameter (from client settings)
  if (req && req.query && req.query.baseUrl) {
    return req.query.baseUrl;
  }
  // Then check environment variable
  if (process.env.NSE_API_BASE_URL) {
    return process.env.NSE_API_BASE_URL;
  }
  // Default fallback
  return 'https://www.nseindia.com/api';
}

// Helper function to get NSE API headers with proper session handling
function getNSEHeaders(baseUrl) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': baseUrl.replace('/api', '') || 'https://www.nseindia.com/',
    'Origin': baseUrl.replace('/api', '') || 'https://www.nseindia.com',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  };
}

// Function to establish NSE session by visiting main page first
async function establishNSESession(baseUrl) {
  try {
    // First, visit the main NSE page to get session cookies
    const mainPageUrl = baseUrl.replace('/api', '') || 'https://www.nseindia.com';
    
    // Use a timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Session establishment timeout')), 3000)
    );
    
    const fetchPromise = fetch(mainPageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      redirect: 'follow',
      timeout: 3000
    });
    
    const sessionResponse = await Promise.race([fetchPromise, timeoutPromise]);
    
    // Extract cookies from response headers
    // node-fetch returns set-cookie as an array or string
    const setCookieHeader = sessionResponse.headers.get('set-cookie');
    let cookies = '';
    
    if (setCookieHeader) {
      if (Array.isArray(setCookieHeader)) {
        // If it's an array, join them
        cookies = setCookieHeader.map(cookie => {
          // Extract just the cookie name=value part (before semicolon)
          return cookie.split(';')[0];
        }).join('; ');
      } else {
        // If it's a string, extract the first cookie value
        const cookieParts = setCookieHeader.split(',');
        cookies = cookieParts.map(cookie => cookie.split(';')[0].trim()).join('; ');
      }
    }
    
    if (cookies) {
      console.log('NSE session cookies obtained');
    }
    
    return cookies;
  } catch (error) {
    // Silently fail - we'll continue without cookies
    console.warn('Could not establish NSE session, continuing without cookies:', error.message);
    return '';
  }
}

// Function to check if market is actually open based on API response
async function checkMarketStatus(req) {
  try {
    const baseUrl = getNSEBaseUrl(req);
    
    // Establish session first
    const cookies = await establishNSESession(baseUrl);
    const headers = getNSEHeaders(baseUrl);
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    // Try to fetch NSE data to check if market is responding with live data
    // Use Promise.race for timeout
    const fetchPromise = fetch(`${baseUrl}/equity-stockIndices?index=NIFTY%2050`, {
      headers: headers
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );
    
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      return { isOpen: false, verified: false, reason: 'API_ERROR' };
    }

    const data = await response.json();
    
    // Check if we got valid data
    if (!data || !data.data || data.data.length === 0) {
      return { isOpen: false, verified: true, reason: 'NO_DATA' };
    }

    const nifty = data.data.find(item => item.symbol === 'NIFTY 50');
    if (!nifty) {
      return { isOpen: false, verified: true, reason: 'NO_NIFTY_DATA' };
    }

    // Check if lastPrice exists and is a valid number (not 0 or null)
    // When market is closed, sometimes lastPrice might be 0 or stale
    const hasValidPrice = nifty.lastPrice && nifty.lastPrice > 0;
    
    // Check timestamp if available (some NSE responses include timestamps)
    // If data is very old (more than 1 hour), market is likely closed
    let isRecentData = true;
    if (data.meta && data.meta.lastUpdateTime) {
      const lastUpdate = new Date(data.meta.lastUpdateTime);
      const now = new Date();
      const diffMinutes = (now - lastUpdate) / (1000 * 60);
      isRecentData = diffMinutes < 60; // Data should be less than 1 hour old
    }

    // Additional check: if change is exactly 0 and pChange is exactly 0, might be closed
    // But this is not reliable as market can have 0 change when open
    const hasActivity = nifty.change !== undefined || nifty.pChange !== undefined;

    // Market is likely open if:
    // 1. We have valid price data
    // 2. Data is recent (if timestamp available)
    // 3. We got a successful API response
    const isOpen = hasValidPrice && isRecentData && hasActivity;

    return {
      isOpen: isOpen,
      verified: true,
      reason: isOpen ? 'LIVE_DATA' : 'STALE_DATA',
      lastPrice: nifty.lastPrice,
      timestamp: data.meta?.lastUpdateTime || new Date().toISOString()
    };

  } catch (error) {
    console.error('Error checking market status:', error);
    // Fallback to time-based check
    return checkMarketStatusByTime();
  }
}

// Fallback: time-based market status check
function checkMarketStatusByTime() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffset = 5.5 * 60 * 60000; // +5:30
  const ist = new Date(utc + istOffset);

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const day = ist.getDay(); // 0 = Sunday, 6 = Saturday

  // Weekend check
  if (day === 0 || day === 6) {
    return { isOpen: false, verified: false, reason: 'WEEKEND' };
  }

  // Market hours: 09:15 to 15:30 IST
  const afterOpen = (hours > 9) || (hours === 9 && minutes >= 15);
  const beforeClose = (hours < 15) || (hours === 15 && minutes <= 30);

  return {
    isOpen: afterOpen && beforeClose,
    verified: false,
    reason: afterOpen && beforeClose ? 'MARKET_HOURS' : 'OUTSIDE_HOURS'
  };
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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
    console.log('Fetching NSE data...');
    
    // Get base URL from request
    const baseUrl = getNSEBaseUrl(req);
    console.log('Using NSE API base URL:', baseUrl);
    
    // Establish NSE session first (get cookies)
    console.log('Establishing NSE session...');
    const cookies = await establishNSESession(baseUrl);
    const headers = getNSEHeaders(baseUrl);
    if (cookies) {
      headers['Cookie'] = cookies;
      console.log('NSE session established with cookies');
    } else {
      console.log('Continuing without session cookies');
    }
    
    // First, check if market is actually open
    const marketStatus = await checkMarketStatus(req);
    console.log('Market status:', marketStatus);
    
    // List of indices to fetch
    const indices = [
      'NIFTY 50',
      'NIFTY BANK',
      'NIFTY IT',
      'NIFTY NEXT 50',
      'NIFTY MIDCAP 50',
      'NIFTY SMALLCAP 50',
      'NIFTY AUTO',
      'NIFTY FMCG',
      'NIFTY PHARMA',
      'NIFTY ENERGY',
      'NIFTY METAL',
      'NIFTY REALTY',
      'NIFTY PSU BANK',
      'NIFTY PVT BANK',
      'NIFTY INFRA'
    ];
    
    // baseUrl already set above, reuse it
    
    // Fetch all indices in parallel
    const fetchPromises = indices.map(index => {
      const encodedIndex = encodeURIComponent(index);
      return fetch(`${baseUrl}/equity-stockIndices?index=${encodedIndex}`, {
        headers: headers
      }).then(res => {
        if (!res.ok) {
          console.warn(`Failed to fetch ${index}: ${res.status} ${res.statusText}`);
          return null;
        }
        return res.json();
      }).catch(error => {
        console.warn(`Error fetching ${index}:`, error.message);
        return null;
      });
    });
    
    // Also fetch VIX
    const vixPromise = fetch(`${baseUrl}/equity-stockIndices?index=INDIA%20VIX`, {
      headers: headers
    }).then(res => {
      if (!res.ok) {
        console.warn(`Failed to fetch VIX: ${res.status} ${res.statusText}`);
        return null;
      }
      return res.json();
    }).catch(error => {
      console.warn('Error fetching VIX:', error.message);
      return null;
    });
    
    // Fetch market breadth data (advances/declines) from market statistics
    // Try multiple endpoints to get advances/declines
    const marketBreadthPromise = Promise.all([
      // Try market statistics endpoint
      fetch(`${baseUrl}/marketStatus`, {
        headers: headers
      }).then(res => {
        if (!res.ok) {
          console.warn(`Failed to fetch marketStatus: ${res.status} ${res.statusText}`);
          return null;
        }
        return res.json();
      }).catch(error => {
        console.warn('Error fetching marketStatus:', error.message);
        return null;
      }),
      // Also try the NIFTY 50 endpoint which might have this data
      fetch(`${baseUrl}/equity-stockIndices?index=NIFTY%2050`, {
        headers: headers
      }).then(res => {
        if (!res.ok) {
          console.warn(`Failed to fetch NIFTY 50 for market breadth: ${res.status} ${res.statusText}`);
          return null;
        }
        return res.json();
      }).catch(error => {
        console.warn('Error fetching NIFTY 50 for market breadth:', error.message);
        return null;
      })
    ]).then(([marketStatus, niftyData]) => {
      // Try to extract advances/declines from either response
      let advances = 0, declines = 0;
      
      // Check market status response
      if (marketStatus && marketStatus.marketState) {
        advances = marketStatus.marketState.advances || 0;
        declines = marketStatus.marketState.declines || 0;
      }
      
      // Check NIFTY 50 data response
      if ((advances === 0 || declines === 0) && niftyData && niftyData.data) {
        const nifty = niftyData.data.find(item => item.symbol === 'NIFTY 50');
        if (nifty) {
          advances = nifty.advances || nifty.advance || advances;
          declines = nifty.declines || nifty.decline || declines;
        }
        // Also check metadata
        if ((advances === 0 || declines === 0) && niftyData.meta) {
          advances = niftyData.meta.advances || advances;
          declines = niftyData.meta.declines || declines;
        }
      }
      
      return { advances, declines, raw: { marketStatus, niftyData } };
    }).catch(() => ({ advances: 0, declines: 0 }));
    
    // Wait for all requests
    const results = await Promise.all([...fetchPromises, vixPromise, marketBreadthPromise]);
    
    // Combine all data
    const allData = {
      indices: [],
      vix: null,
      marketBreadth: { advances: 0, declines: 0 }
    };
    
    // Extract market breadth from the last result (market breadth promise)
    const marketBreadthData = results[results.length - 1];
    if (marketBreadthData && marketBreadthData.advances !== undefined) {
      allData.marketBreadth.advances = marketBreadthData.advances || 0;
      allData.marketBreadth.declines = marketBreadthData.declines || 0;
    }
    
    results.slice(0, -1).forEach((data, index) => {
      if (data && data.data && data.data.length > 0) {
        if (index < indices.length) {
          // This is an index
          const indexData = data.data.find(item => item.symbol === indices[index]);
          if (indexData) {
            allData.indices.push({
              symbol: indices[index],
              lastPrice: indexData.lastPrice,
              change: indexData.change,
              pChange: indexData.pChange
            });
          }
        } else if (index === indices.length) {
          // This is VIX
          const vixData = data.data.find(item => item.symbol === 'INDIA VIX');
          if (vixData) {
            allData.vix = {
              last: vixData.lastPrice,
              change: vixData.change,
              pChange: vixData.pChange
            };
          }
        }
      }
    });
    
    console.log(`NSE data fetched successfully: ${allData.indices.length} indices`);
    console.log(`Market Breadth: Advances=${allData.marketBreadth.advances}, Declines=${allData.marketBreadth.declines}`);
    
    // If advances/declines are 0, try to calculate from indices
    if (allData.marketBreadth.advances === 0 && allData.marketBreadth.declines === 0 && allData.indices.length > 0) {
      const positiveIndices = allData.indices.filter(idx => idx.pChange > 0).length;
      const negativeIndices = allData.indices.filter(idx => idx.pChange < 0).length;
      // Estimate based on index performance (rough approximation)
      allData.marketBreadth.advances = positiveIndices * 10; // Rough estimate
      allData.marketBreadth.declines = negativeIndices * 10;
      console.log(`Estimated Market Breadth from indices: Advances=${allData.marketBreadth.advances}, Declines=${allData.marketBreadth.declines}`);
    }
    
    const processedData = processMarketData(allData);
    
    // Add market status to response
    processedData.marketStatus = {
      isOpen: marketStatus.isOpen,
      verified: marketStatus.verified,
      reason: marketStatus.reason,
      timestamp: marketStatus.timestamp || new Date().toISOString()
    };
    
    res.status(200).json(processedData);
    
  } catch (error) {
    console.error('Error fetching NSE data:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Check market status even on error
    const marketStatus = await checkMarketStatus(req).catch(() => checkMarketStatusByTime());
    
    // Return mock data as fallback
    const mockData = {
      mood: { score: 65, text: 'Bullish', emoji: '😊' },
      indices: [
        { symbol: 'NIFTY 50', lastPrice: 21500.45, change: 125.50, pChange: 0.59, advances: 28, declines: 17 },
        { symbol: 'NIFTY BANK', lastPrice: 47500.75, change: 280.25, pChange: 0.59, advances: 0, declines: 0 },
        { symbol: 'NIFTY IT', lastPrice: 35000.25, change: 150.30, pChange: 0.43, advances: 0, declines: 0 }
      ],
      vix: { last: 14.25, change: -0.35, pChange: -2.40 },
      advanceDecline: { advances: 28, declines: 17 },
      timestamp: new Date().toISOString(),
      note: 'Using mock data - API failed',
      marketStatus: {
        isOpen: marketStatus.isOpen,
        verified: marketStatus.verified,
        reason: marketStatus.reason,
        timestamp: new Date().toISOString()
      }
    };
    
    res.status(200).json(mockData);
  }
};

function processMarketData(data) {
  try {
    // Find NIFTY 50 for mood calculation
    const nifty50 = data.indices.find(item => item.symbol === 'NIFTY 50');
    
    const moodScore = calculateMoodScore(nifty50, data.indices, data.marketBreadth);
    const mood = getMoodFromScore(moodScore);
    
    return {
      mood: mood,
      indices: data.indices, // All available indices
      vix: data.vix || {
        last: 0,
        change: 0,
        pChange: 0
      },
      advanceDecline: {
        advances: data.marketBreadth?.advances || 0,
        declines: data.marketBreadth?.declines || 0
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error('Error processing market data: ' + error.message);
  }
}

function calculateMoodScore(nifty50, allIndices, marketBreadth) {
  let score = 50;
  
  if (!nifty50) return score;
  
  // NIFTY 50 performance
  if (nifty50.pChange > 0.5) score += 20;
  else if (nifty50.pChange < -0.5) score -= 20;
  else if (nifty50.pChange > 0.1) score += 10;
  else if (nifty50.pChange < -0.1) score -= 10;
  
  // Market breadth (from marketBreadth object)
  if (marketBreadth && marketBreadth.advances > 0 && marketBreadth.declines > 0) {
    if (marketBreadth.advances > marketBreadth.declines * 1.5) score += 15;
    else if (marketBreadth.declines > marketBreadth.advances * 1.5) score -= 15;
  }
  
  // Consider other major indices
  const majorIndices = allIndices.filter(idx => 
    ['NIFTY BANK', 'NIFTY IT', 'NIFTY NEXT 50'].includes(idx.symbol)
  );
  
  const positiveCount = majorIndices.filter(idx => idx.pChange > 0).length;
  const negativeCount = majorIndices.filter(idx => idx.pChange < 0).length;
  
  if (positiveCount > negativeCount * 1.5) score += 5;
  else if (negativeCount > positiveCount * 1.5) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

function getMoodFromScore(score) {
  if (score >= 80) return { score, text: 'Extremely Bullish', emoji: '🚀' };
  if (score >= 70) return { score, text: 'Very Bullish', emoji: '📈' };
  if (score >= 60) return { score, text: 'Bullish', emoji: '😊' };
  if (score >= 50) return { score, text: 'Slightly Bullish', emoji: '🙂' };
  if (score >= 40) return { score, text: 'Neutral', emoji: '😐' };
  if (score >= 30) return { score, text: 'Slightly Bearish', emoji: '🙁' };
  if (score >= 20) return { score, text: 'Bearish', emoji: '😟' };
  if (score >= 10) return { score, text: 'Very Bearish', emoji: '📉' };
  return { score, text: 'Extremely Bearish', emoji: '🐻' };
}