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
    
    const response = await fetch('https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`NSE API responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('NSE data fetched successfully');
    
    const processedData = processMarketData(data);
    
    res.status(200).json(processedData);
    
  } catch (error) {
    console.error('Error fetching NSE data:', error);
    
    // Return mock data as fallback
    const mockData = {
      mood: { score: 65, text: 'Bullish 😊', emoji: '😊' },
      nifty: { last: 21500.45, change: 125.50, pChange: 0.59 },
      bankNifty: { last: 47500.75, change: 280.25, pChange: 0.59 },
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
    const nifty = data.data.find(item => item.symbol === 'NIFTY 50');
    const bankNifty = data.data.find(item => item.symbol === 'NIFTY BANK');
    
    const moodScore = calculateMoodScore(data);
    const mood = getMoodFromScore(moodScore);
    
    return {
      mood: mood,
      nifty: {
        last: nifty?.lastPrice || 0,
        change: nifty?.change || 0,
        pChange: nifty?.pChange || 0
      },
      bankNifty: {
        last: bankNifty?.lastPrice || 0,
        change: bankNifty?.change || 0,
        pChange: bankNifty?.pChange || 0
      },
      vix: {
        last: 15.0,
        change: 0.5,
        pChange: 3.45
      },
      advanceDecline: {
        advances: nifty?.advances || 25,
        declines: nifty?.declines || 15
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error('Error processing market data: ' + error.message);
  }
}

function calculateMoodScore(data) {
  let score = 50;
  const nifty = data.data.find(item => item.symbol === 'NIFTY 50');
  
  if (!nifty) return score;
  
  if (nifty.pChange > 0.5) score += 20;
  else if (nifty.pChange < -0.5) score -= 20;
  else if (nifty.pChange > 0.1) score += 10;
  else if (nifty.pChange < -0.1) score -= 10;
  
  if (nifty.advances > nifty.declines * 1.5) score += 15;
  else if (nifty.declines > nifty.advances * 1.5) score -= 15;
  
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