/**
 * GET /api/pipeline/candidates
 * Get candidates for a trading day
 * 
 * Query: ?tradingDay=YYYY-MM-DD&strategy=momentum_gap
 */

const { getCandidatesForDay } = require('../lib/signals/pipeline-orchestrator');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET.'
    });
  }
  
  try {
    const { tradingDay, strategy = 'momentum_gap' } = req.query;
    
    if (!tradingDay) {
      return res.status(400).json({
        success: false,
        message: 'tradingDay query parameter is required'
      });
    }
    
    const candidates = await getCandidatesForDay(tradingDay, strategy);
    
    res.json({
      success: true,
      candidates: candidates,
      count: candidates.length,
      tradingDay: tradingDay,
      strategy: strategy
    });
    
  } catch (error) {
    console.error('❌ [Pipeline API] Get candidates error:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching candidates: ${error.message}`,
      error: error.message
    });
  }
};

