/**
 * GET /api/pipeline/active
 * Get active signals for a date
 * 
 * Query: ?premarketDate=YYYY-MM-DD&strategy=momentum_gap
 */

const { getActiveSignalsForDay } = require('../lib/signals/pipeline-orchestrator');

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
    const { premarketDate, strategy = 'momentum_gap' } = req.query;
    
    if (!premarketDate) {
      return res.status(400).json({
        success: false,
        message: 'premarketDate query parameter is required'
      });
    }
    
    const signals = await getActiveSignalsForDay(premarketDate, strategy);
    
    res.json({
      success: true,
      activeSignals: signals,
      count: signals.length,
      premarketDate: premarketDate,
      strategy: strategy
    });
    
  } catch (error) {
    console.error('❌ [Pipeline API] Get active signals error:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching active signals: ${error.message}`,
      error: error.message
    });
  }
};

