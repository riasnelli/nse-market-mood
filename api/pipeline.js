/**
 * Pipeline API Endpoints
 * 
 * Endpoints for the 2-phase intraday signal pipeline:
 * - POST /api/pipeline/build-candidates - Phase 1: Build candidates after market close
 * - POST /api/pipeline/activate - Phase 2: Activate candidates when premarket is available
 * - GET /api/pipeline/candidates - Get candidates for a trading day
 * - GET /api/pipeline/active - Get active signals for a date
 * - GET /api/pipeline/rejected - Get rejected candidates for a date
 */

const { authMiddleware } = require('./lib/auth');
const {
  buildCandidatesPhase,
  activateCandidatesPhase,
  getCandidatesForDay,
  getActiveSignalsForDay,
  getRejectedCandidatesForDay
} = require('./lib/signals/pipeline-orchestrator');
const { nextTradingDay, prevTradingDay } = require('./lib/tradingCalendar');

/**
 * POST /api/pipeline/build-candidates
 * Phase 1: Build candidates after market close
 * 
 * Body: { eodDate, strategy, params }
 */
async function buildCandidatesHandler(req, res) {
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
}

/**
 * POST /api/pipeline/activate
 * Phase 2: Activate candidates when premarket is available
 * 
 * Body: { premarketDate, strategy }
 */
async function activateCandidatesHandler(req, res) {
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
}

/**
 * GET /api/pipeline/candidates
 * Get candidates for a trading day
 * 
 * Query: ?tradingDay=YYYY-MM-DD&strategy=momentum_gap
 */
async function getCandidatesHandler(req, res) {
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
}

/**
 * GET /api/pipeline/active
 * Get active signals for a date
 * 
 * Query: ?premarketDate=YYYY-MM-DD&strategy=momentum_gap
 */
async function getActiveSignalsHandler(req, res) {
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
}

/**
 * GET /api/pipeline/rejected
 * Get rejected candidates for a date
 * 
 * Query: ?tradingDay=YYYY-MM-DD&strategy=momentum_gap
 */
async function getRejectedCandidatesHandler(req, res) {
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
}

/**
 * Main handler for Vercel serverless function
 * Routes requests based on path and method
 */
module.exports = async (req, res) => {
  // Extract path and method
  const path = req.url.split('?')[0]; // Remove query string
  const method = req.method;
  
  // Route based on path
  if (path === '/api/pipeline/build-candidates' && method === 'POST') {
    return await buildCandidatesHandler(req, res);
  } else if (path === '/api/pipeline/activate' && method === 'POST') {
    return await activateCandidatesHandler(req, res);
  } else if (path === '/api/pipeline/candidates' && method === 'GET') {
    return await getCandidatesHandler(req, res);
  } else if (path === '/api/pipeline/active' && method === 'GET') {
    return await getActiveSignalsHandler(req, res);
  } else if (path === '/api/pipeline/rejected' && method === 'GET') {
    return await getRejectedCandidatesHandler(req, res);
  } else {
    res.status(404).json({
      success: false,
      message: 'Pipeline endpoint not found',
      availableEndpoints: [
        'POST /api/pipeline/build-candidates',
        'POST /api/pipeline/activate',
        'GET /api/pipeline/candidates',
        'GET /api/pipeline/active',
        'GET /api/pipeline/rejected'
      ]
    });
  }
};

// Also export individual handlers for testing
module.exports.buildCandidatesHandler = buildCandidatesHandler;
module.exports.activateCandidatesHandler = activateCandidatesHandler;
module.exports.getCandidatesHandler = getCandidatesHandler;
module.exports.getActiveSignalsHandler = getActiveSignalsHandler;
module.exports.getRejectedCandidatesHandler = getRejectedCandidatesHandler;

