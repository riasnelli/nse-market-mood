/**
 * GET /api/pipeline/rejected
 * Get rejected candidates for a date
 * 
 * Query: ?tradingDay=YYYY-MM-DD&strategy=momentum_gap
 */

const { getRejectedCandidatesForDay } = require('../lib/signals/pipeline-orchestrator');

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
    
    const rejected = await getRejectedCandidatesForDay(tradingDay, strategy);
    
    res.json({
      success: true,
      rejectedCandidates: rejected,
      count: rejected.length,
      tradingDay: tradingDay,
      strategy: strategy
    });
    
  } catch (error) {
    console.error('❌ [Pipeline API] Get rejected candidates error:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching rejected candidates: ${error.message}`,
      error: error.message
    });
  }
};

