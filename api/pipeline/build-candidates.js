/**
 * POST /api/pipeline/build-candidates
 * Phase 1: Build candidates after market close
 * 
 * Body: { eodDate, strategy, params }
 */

const { authMiddleware } = require('../lib/auth');
const { buildCandidatesPhase } = require('../lib/signals/pipeline-orchestrator');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST.'
    });
  }
  
  try {
    const { eodDate, strategy = 'momentum_gap', params = {} } = req.body;
    
    if (!eodDate) {
      return res.status(400).json({
        success: false,
        message: 'eodDate is required'
      });
    }
    
    console.log(`📋 [Pipeline API] Building candidates for EOD: ${eodDate}, strategy: ${strategy}`);
    
    const result = await buildCandidatesPhase(eodDate, strategy, params);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.json({
      success: true,
      candidates: result.candidates,
      stored: result.stored,
      tradingDay: result.tradingDay,
      message: result.message
    });
    
  } catch (error) {
    console.error('❌ [Pipeline API] Build candidates error:', error);
    res.status(500).json({
      success: false,
      message: `Error building candidates: ${error.message}`,
      error: error.message
    });
  }
};

