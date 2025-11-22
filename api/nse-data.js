const fetch = require('node-fetch');

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
    
    // Fetch all indices in parallel
    const fetchPromises = indices.map(index => {
      const encodedIndex = encodeURIComponent(index);
      return fetch(`https://www.nseindia.com/api/equity-stockIndices?index=${encodedIndex}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }).then(res => res.ok ? res.json() : null).catch(() => null);
    });
    
    // Also fetch VIX
    const vixPromise = fetch('https://www.nseindia.com/api/equity-stockIndices?index=INDIA%20VIX', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }).then(res => res.ok ? res.json() : null).catch(() => null);
    
    // Wait for all requests
    const results = await Promise.all([...fetchPromises, vixPromise]);
    
    // Combine all data
    const allData = {
      indices: [],
      vix: null
    };
    
    results.forEach((data, index) => {
      if (data && data.data && data.data.length > 0) {
        if (index < indices.length) {
          // This is an index
          const indexData = data.data.find(item => item.symbol === indices[index]);
          if (indexData) {
            allData.indices.push({
              symbol: indices[index],
              lastPrice: indexData.lastPrice,
              change: indexData.change,
              pChange: indexData.pChange,
              advances: indexData.advances,
              declines: indexData.declines
            });
          }
        } else {
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
    
    const processedData = processMarketData(allData);
    
    res.status(200).json(processedData);
    
  } catch (error) {
    console.error('Error fetching NSE data:', error);
    
    // Return mock data as fallback
    const mockData = {
      mood: { score: 65, text: 'Bullish 😊', emoji: '😊' },
      indices: [
        { symbol: 'NIFTY 50', lastPrice: 21500.45, change: 125.50, pChange: 0.59, advances: 28, declines: 17 },
        { symbol: 'NIFTY BANK', lastPrice: 47500.75, change: 280.25, pChange: 0.59, advances: 0, declines: 0 },
        { symbol: 'NIFTY IT', lastPrice: 35000.25, change: 150.30, pChange: 0.43, advances: 0, declines: 0 }
      ],
      vix: { last: 14.25, change: -0.35, pChange: -2.40 },
      advanceDecline: { advances: 28, declines: 17 },
      timestamp: new Date().toISOString(),
      note: 'Using mock data - API failed'
    };
    
    res.status(200).json(mockData);
  }
};

function processMarketData(data) {
  try {
    // Find NIFTY 50 for mood calculation and advance/decline
    const nifty50 = data.indices.find(item => item.symbol === 'NIFTY 50');
    const bankNifty = data.indices.find(item => item.symbol === 'NIFTY BANK');
    
    const moodScore = calculateMoodScore(nifty50, data.indices);
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
        advances: nifty50?.advances || 0,
        declines: nifty50?.declines || 0
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error('Error processing market data: ' + error.message);
  }
}

function calculateMoodScore(nifty50, allIndices) {
  let score = 50;
  
  if (!nifty50) return score;
  
  // NIFTY 50 performance
  if (nifty50.pChange > 0.5) score += 20;
  else if (nifty50.pChange < -0.5) score -= 20;
  else if (nifty50.pChange > 0.1) score += 10;
  else if (nifty50.pChange < -0.1) score -= 10;
  
  // Market breadth
  if (nifty50.advances > nifty50.declines * 1.5) score += 15;
  else if (nifty50.declines > nifty50.advances * 1.5) score -= 15;
  
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