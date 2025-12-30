/**
 * Pipeline Orchestrator
 * 
 * Coordinates the 2-phase intraday signal pipeline:
 * Phase 1: Build candidates after market close
 * Phase 2: Activate candidates when premarket data is available
 */

const {
  getSignalsStoreCollection
} = require('../mongodb');
const { buildCandidatesFromEOD, validateCandidatesNoPremarket } = require('./candidate-builder');
const { activateCandidatesWithPremarket, validatePremarketDateMatch } = require('./candidate-activator');
const { nextTradingDay, prevTradingDay } = require('../tradingCalendar');
const config = require('./pipeline-config');

const {
  getSignalCandidatesCollection,
  getActiveSignalsCollection: getActiveSignalsCollectionFromDB
} = require('../mongodb');

/**
 * Phase 1: Build candidates after market close
 * 
 * This should be called after EOD data is uploaded/imported.
 * 
 * @param {string} eodDate - Today's EOD date (YYYY-MM-DD)
 * @param {string} strategy - Strategy name
 * @param {Object} params - Strategy parameters
 * @returns {Promise<Object>} - { success, candidates, message }
 */
async function buildCandidatesPhase(eodDate, strategy = 'momentum_gap', params = {}) {
  try {
    console.log(`📋 [Pipeline] Phase 1: Building candidates for next day using EOD: ${eodDate}`);
    
    // Build candidates using ONLY EOD data (no premarket)
    const result = await buildCandidatesFromEOD(eodDate, strategy, params);
    
    if (!result.success) {
      return result;
    }
    
    // Validate that candidates don't have premarket data
    const isValid = validateCandidatesNoPremarket(result.candidates);
    if (!isValid) {
      console.warn('⚠️ [Pipeline] Some candidates contain premarket data - this should not happen');
    }
    
    // Store candidates in database
    const candidatesCollection = await getSignalCandidatesCollection();
    const tradingDay = result.meta.tradingDay;
    
    // Delete existing candidates for this trading day and strategy
    await candidatesCollection.deleteMany({
      tradingDay: tradingDay,
      strategy: strategy
    });
    
    // Insert new candidates
    const candidatesToStore = result.candidates.map(c => ({
      ...c,
      tradingDay: tradingDay,
      strategy: strategy,
      eodDate: eodDate,
      status: 'PENDING', // Pending activation
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    if (candidatesToStore.length > 0) {
      await candidatesCollection.insertMany(candidatesToStore);
      console.log(`✅ [Pipeline] Stored ${candidatesToStore.length} candidates for ${tradingDay}`);
    }
    
    return {
      success: true,
      candidates: result.candidates,
      stored: candidatesToStore.length,
      tradingDay: tradingDay,
      message: result.message
    };
    
  } catch (error) {
    console.error('❌ [Pipeline] Phase 1 error:', error);
    return {
      success: false,
      candidates: [],
      message: `Error in Phase 1: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Phase 2: Activate candidates when premarket data is available
 * 
 * This should be called after tomorrow's premarket data is uploaded/imported.
 * 
 * @param {string} premarketDate - Tomorrow's premarket date (YYYY-MM-DD)
 * @param {string} strategy - Strategy name
 * @returns {Promise<Object>} - { success, activeSignals, rejectedCandidates, message }
 */
async function activateCandidatesPhase(premarketDate, strategy = 'momentum_gap') {
  try {
    console.log(`🚀 [Pipeline] Phase 2: Activating candidates for ${premarketDate}, strategy: ${strategy}`);
    
    // Get pending candidates for this trading day and strategy
    const candidatesCollection = await getSignalCandidatesCollection();
    const candidates = await candidatesCollection
      .find({
        tradingDay: premarketDate,
        strategy: strategy,
        status: 'PENDING'
      })
      .toArray();
    
    if (candidates.length === 0) {
      return {
        success: false,
        activeSignals: [],
        rejectedCandidates: [],
        message: `No pending candidates found for ${premarketDate} with strategy ${strategy}`
      };
    }
    
    // Validate premarket date matches candidate trading day
    const dateValidation = validatePremarketDateMatch(candidates, premarketDate);
    if (!dateValidation.valid) {
      return {
        success: false,
        activeSignals: [],
        rejectedCandidates: [],
        message: dateValidation.reason
      };
    }
    
    // Activate candidates with premarket data
    const result = await activateCandidatesWithPremarket(candidates, premarketDate, strategy);
    
    if (!result.success) {
      return result;
    }
    
    // Store active signals
    const activeSignalsCollection = await getActiveSignalsCollectionFromDB();
    
    // Delete existing active signals for this date and strategy
    await activeSignalsCollection.deleteMany({
      premarketDate: premarketDate,
      strategy: strategy
    });
    
    // Insert new active signals
    const activeSignalsToStore = result.activeSignals.map(signal => ({
      ...signal,
      premarketDate: premarketDate,
      strategy: strategy,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    if (activeSignalsToStore.length > 0) {
      await activeSignalsCollection.insertMany(activeSignalsToStore);
      console.log(`✅ [Pipeline] Stored ${activeSignalsToStore.length} active signals for ${premarketDate}`);
    }
    
    // Update candidate status
    const activatedSymbols = new Set(result.activeSignals.map(s => s.symbol));
    const rejectedSymbols = new Set(result.rejectedCandidates.map(r => r.candidate.symbol));
    
    // Mark activated candidates
    if (activatedSymbols.size > 0) {
      await candidatesCollection.updateMany(
        {
          tradingDay: premarketDate,
          strategy: strategy,
          symbol: { $in: Array.from(activatedSymbols) }
        },
        {
          $set: {
            status: 'ACTIVATED',
            activatedAt: new Date()
          }
        }
      );
    }
    
    // Mark rejected candidates
    if (rejectedSymbols.size > 0) {
      for (const rejected of result.rejectedCandidates) {
        await candidatesCollection.updateOne(
          {
            tradingDay: premarketDate,
            strategy: strategy,
            symbol: rejected.candidate.symbol
          },
          {
            $set: {
              status: 'REJECTED',
              rejectionReason: rejected.reason,
              rejectionDetails: rejected.details,
              rejectedAt: rejected.timestamp
            }
          }
        );
      }
    }
    
    return {
      success: true,
      activeSignals: result.activeSignals,
      rejectedCandidates: result.rejectedCandidates,
      stored: activeSignalsToStore.length,
      message: result.message
    };
    
  } catch (error) {
    console.error('❌ [Pipeline] Phase 2 error:', error);
    return {
      success: false,
      activeSignals: [],
      rejectedCandidates: [],
      message: `Error in Phase 2: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Get candidates for a trading day
 * 
 * @param {string} tradingDay - Trading day (YYYY-MM-DD)
 * @param {string} strategy - Strategy name
 * @returns {Promise<Array>} - Array of candidate objects
 */
async function getCandidatesForDay(tradingDay, strategy = 'momentum_gap') {
  try {
    const candidatesCollection = await getSignalCandidatesCollection();
    const candidates = await candidatesCollection
      .find({
        tradingDay: tradingDay,
        strategy: strategy
      })
      .sort({ confidenceBase: -1 })
      .toArray();
    
    return candidates;
  } catch (error) {
    console.error('Error fetching candidates:', error);
    return [];
  }
}

/**
 * Get active signals for a date
 * 
 * @param {string} premarketDate - Premarket date (YYYY-MM-DD)
 * @param {string} strategy - Strategy name
 * @returns {Promise<Array>} - Array of active signal objects
 */
async function getActiveSignalsForDay(premarketDate, strategy = 'momentum_gap') {
  try {
    const activeSignalsCollection = await getActiveSignalsCollectionFromDB();
    const signals = await activeSignalsCollection
      .find({
        premarketDate: premarketDate,
        strategy: strategy,
        status: 'ACTIVE'
      })
      .sort({ score: -1 })
      .toArray();
    
    return signals;
  } catch (error) {
    console.error('Error fetching active signals:', error);
    return [];
  }
}

/**
 * Get rejected candidates for a date
 * 
 * @param {string} tradingDay - Trading day (YYYY-MM-DD)
 * @param {string} strategy - Strategy name
 * @returns {Promise<Array>} - Array of rejected candidate objects
 */
async function getRejectedCandidatesForDay(tradingDay, strategy = 'momentum_gap') {
  try {
    const candidatesCollection = await getSignalCandidatesCollection();
    const rejected = await candidatesCollection
      .find({
        tradingDay: tradingDay,
        strategy: strategy,
        status: 'REJECTED'
      })
      .sort({ confidenceBase: -1 })
      .toArray();
    
    return rejected;
  } catch (error) {
    console.error('Error fetching rejected candidates:', error);
    return [];
  }
}

module.exports = {
  buildCandidatesPhase,
  activateCandidatesPhase,
  getCandidatesForDay,
  getActiveSignalsForDay,
  getRejectedCandidatesForDay
};

