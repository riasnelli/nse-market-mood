/**
 * Strategy Registry
 * 
 * Manages available strategies and their supported modes
 */

const { MODE_EOD, MODE_PREM, MODE_LIVE } = require('./mode');
const momentumGapModule = require('./strategies/momentumGap');
const runMomentumGap = momentumGapModule.runMomentumGap;
const momentumGapDefaults = momentumGapModule.DEFAULTS;

/**
 * Strategy Registry
 */
const STRATEGIES = {
  momentum_gap: {
    id: 'momentum_gap',
    name: 'Momentum Gap',
    description: 'Find stocks with positive gaps and strong momentum. Best for bullish markets with low volatility.',
    supportedModes: [MODE_EOD, MODE_PREM, MODE_LIVE],
    params: {
      gapMin: { type: 'number', default: 1.5, min: 0.5, max: 5, label: 'Min Gap %' },
      gapMax: { type: 'number', default: 12, min: 5, max: 30, label: 'Max Gap %' },
      preMMinAbs: { type: 'number', default: 25000, min: 10000, max: 100000, label: 'Min Premarket Volume' },
      preMMinRel: { type: 'number', default: 0.05, min: 0.01, max: 0.2, label: 'Min Relative Volume' },
      eodScoreMin: { type: 'number', default: 45, min: 30, max: 70, label: 'EOD Score Min' },
      preMScoreMin: { type: 'number', default: 50, min: 40, max: 80, label: 'Premarket Score Min' },
      extremeGapMode: { type: 'boolean', default: false, label: 'Extreme Gap Mode (12-30%)' }
    },
    defaults: momentumGapDefaults,
    run: runMomentumGap
  },
  breakout: {
    id: 'breakout',
    name: 'Breakout',
    description: 'Look for stocks breaking out of consolidation patterns with high volume.',
    supportedModes: [MODE_EOD, MODE_PREM],
    params: {},
    defaults: {},
    run: async ({ date, mode, eodDate, preMDate, moodScore, params }) => {
      // Placeholder - implement breakout strategy
      return {
        success: false,
        signals: [],
        diagnostics: {},
        message: 'Breakout strategy not yet implemented'
      };
    }
  },
  mean_reversion: {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    description: 'Find oversold stocks that may revert to mean.',
    supportedModes: [MODE_EOD, MODE_PREM],
    params: {},
    defaults: {},
    run: async ({ date, mode, eodDate, preMDate, moodScore, params }) => {
      // Placeholder - implement mean reversion strategy
      return {
        success: false,
        signals: [],
        diagnostics: {},
        message: 'Mean reversion strategy not yet implemented'
      };
    }
  },
  defensive: {
    id: 'defensive',
    name: 'Defensive / Wait',
    description: 'Conservative approach for bearish markets.',
    supportedModes: [MODE_EOD, MODE_PREM],
    params: {},
    defaults: {},
    run: async ({ date, mode, eodDate, preMDate, moodScore, params }) => {
      // Placeholder - implement defensive strategy
      return {
        success: false,
        signals: [],
        diagnostics: {},
        message: 'Defensive strategy not yet implemented'
      };
    }
  },
  volatility_play: {
    id: 'volatility_play',
    name: 'Volatility Play',
    description: 'Focus on high-beta stocks with strong momentum.',
    supportedModes: [MODE_EOD, MODE_PREM],
    params: {},
    defaults: {},
    run: async ({ date, mode, eodDate, preMDate, moodScore, params }) => {
      // Placeholder - implement volatility play strategy
      return {
        success: false,
        signals: [],
        diagnostics: {},
        message: 'Volatility play strategy not yet implemented'
      };
    }
  },
  watchlist_score: {
    id: 'watchlist_score',
    name: 'Watchlist Score (EOD)',
    description: 'EOD-only: Identify stocks likely to move tomorrow.',
    supportedModes: [MODE_EOD],
    params: {},
    defaults: {},
    run: async ({ date, mode, eodDate, preMDate, moodScore, params }) => {
      // Use existing watchlist_score implementation
      const { generateWatchlistScoreSignals } = require('../generateSignals');
      return await generateWatchlistScoreSignals(date, 'watchlist_score', eodDate);
    }
  },
  eod_breakout: {
    id: 'eod_breakout',
    name: 'EOD Breakout (EOD)',
    description: 'EOD-only: Find breakout candidates with close in top 30% of range.',
    supportedModes: [MODE_EOD],
    params: {},
    defaults: {},
    run: async ({ date, mode, eodDate, preMDate, moodScore, params }) => {
      // Use existing eod_breakout implementation
      const { generateEODBreakoutSignals } = require('../generateSignals');
      return await generateEODBreakoutSignals(date, 'eod_breakout', eodDate);
    }
  }
};

/**
 * Get strategy by ID
 */
function getStrategy(strategyId) {
  return STRATEGIES[strategyId] || null;
}

/**
 * Get all strategies
 */
function getAllStrategies() {
  return Object.values(STRATEGIES);
}

/**
 * Check if strategy supports a mode
 */
function supportsMode(strategyId, mode) {
  const strategy = getStrategy(strategyId);
  if (!strategy) return false;
  return strategy.supportedModes.includes(mode);
}

/**
 * Get strategies that support a mode
 */
function getStrategiesForMode(mode) {
  return getAllStrategies().filter(s => s.supportedModes.includes(mode));
}

module.exports = {
  STRATEGIES,
  getStrategy,
  getAllStrategies,
  supportsMode,
  getStrategiesForMode
};

