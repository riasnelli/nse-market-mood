/**
 * POST /api/pipeline/activate
 * Phase 2: Activate candidates when premarket is available
 * 
 * Body: { premarketDate, strategy }
 */

const { authMiddleware } = require('../lib/auth');
const { activateCandidatesPhase } = require('../lib/signals/pipeline-orchestrator');

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
    const { premarketDate, strategy = 'momentum_gap' } = req.body;
    
    if (!premarketDate) {
      return res.status(400).json({
        success: false,
        message: 'premarketDate is required'
      });
    }
    
    console.log(`🚀 [Pipeline API] Activating candidates for premarket: ${premarketDate}, strategy: ${strategy}`);
    
    const result = await activateCandidatesPhase(premarketDate, strategy);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.json({
      success: true,
      activeSignals: result.activeSignals,
      rejectedCandidates: result.rejectedCandidates,
      stored: result.stored,
      message: result.message
    });
    
  } catch (error) {
    console.error('❌ [Pipeline API] Activate candidates error:', error);
    res.status(500).json({
      success: false,
      message: `Error activating candidates: ${error.message}`,
      error: error.message
    });
  }
};

