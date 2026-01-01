/**
 * Signals Context Resolver
 * 
 * Resolves signal date, EOD date, premarket date, and mode based on:
 * - Market status (isOpen)
 * - Data availability (Bhav, PreM)
 * - User override (if any)
 * - Current time
 */

const {
  getDailyBhavcopyCollection,
  getPreMarketDataCollection,
  getUploadedDataCollection
} = require('../mongodb');
const { nextTradingDay, prevTradingDay, isTradingDay } = require('../tradingCalendar');
const { MODE_EOD, MODE_PREM, MODE_LIVE, MODE_NONE, getTodayIST } = require('./mode');

/**
 * Get latest available Bhav date (up to and including maxDate)
 */
async function getLatestBhavDate(maxDate) {
  try {
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    
    // Find latest Bhav date <= maxDate
    const latestBhav = await bhavcopyCollection
      .find({ 
        date: { $lte: maxDate },
        series: 'EQ'
      })
      .sort({ date: -1 })
      .limit(1)
      .toArray();
    
    if (latestBhav.length > 0) {
      return latestBhav[0].date;
    }
    
    // Check uploaded bhavcopy
    const uploadedBhavCollection = await getUploadedDataCollection('bhav');
    const uploadedBhav = await uploadedBhavCollection
      .find({ date: { $lte: maxDate } })
      .sort({ date: -1 })
      .limit(1)
      .toArray();
    
    if (uploadedBhav.length > 0) {
      return uploadedBhav[0].date;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting latest Bhav date:', error);
    return null;
  }
}

/**
 * Check if PreM data exists for a date
 */
async function hasPreMForDate(date) {
  try {
    const premarketCollection = await getPreMarketDataCollection();
    const preMCount = await premarketCollection.countDocuments({ date: date });
    
    if (preMCount > 0) return true;
    
    const uploadedPreMCollection = await getUploadedDataCollection('premarket');
    const uploadedCount = await uploadedPreMCollection.countDocuments({ date: date });
    
    return uploadedCount > 0;
  } catch (error) {
    console.error('Error checking PreM data:', error);
    return false;
  }
}

/**
 * Resolve signals context
 * 
 * @param {Object} options
 * @param {string} options.targetDate - Requested date (YYYY-MM-DD) - use this as signalDate, don't auto-jump
 * @param {string} options.today - Today's date (YYYY-MM-DD)
 * @param {Object} options.marketStatus - { isOpen: boolean, reason?: string, timestamp?: string }
 * @param {Object} options.userOverride - { mode?: string, strategy?: string } from localStorage
 * @returns {Promise<Object>} - { signalDate, refEodDate, premarketDate, mode, missingFiles, reason }
 */
async function resolveSignalsContext({ targetDate, today, marketStatus = { isOpen: false }, userOverride = {} }) {
  const missingFiles = [];
  let signalDate = targetDate || today; // Use requested date, don't auto-jump
  let refEodDate = null;
  let premarketDate = null;
  let mode = MODE_NONE;
  let reason = '';
  
  // Handle API_FORBIDDEN: treat as UNKNOWN (don't force closed)
  const effectiveMarketStatus = { ...marketStatus };
  if (marketStatus.reason === 'API_FORBIDDEN') {
    effectiveMarketStatus.isOpen = undefined; // Treat as unknown
    effectiveMarketStatus.verified = false;
  }
  
  // Get latest Bhav date (any date <= signalDate)
  const latestBhavDate = await getLatestBhavDate(signalDate);
  
  if (!latestBhavDate) {
    return {
      signalDate,
      refEodDate: null,
      premarketDate: null,
      mode: MODE_NONE,
      missingFiles: [`bhavcopy for ${signalDate}`],
      reason: `No Bhavcopy data available up to ${signalDate}`
    };
  }
  
  refEodDate = latestBhavDate;
  
  // Check premarket availability:
  // 1. First check for signalDate (if mode is PREMARKET/LIVE for target date)
  // 2. Then check for refEodDate (the date we actually use for EOD data)
  // This ensures we correctly detect premarket when it exists for the refDate
  const hasSignalDatePreM = await hasPreMForDate(signalDate);
  const hasRefDatePreM = await hasPreMForDate(refEodDate);
  
  if (hasSignalDatePreM) {
    premarketDate = signalDate;
  } else if (hasRefDatePreM) {
    // Premarket exists for refDate (the EOD date we're using)
    premarketDate = refEodDate;
  } else {
    // Try to find latest premarket date >= refEodDate and <= signalDate
    try {
      const premarketCollection = await getPreMarketDataCollection();
      const latestPreM = await premarketCollection
        .find({ date: { $gte: refEodDate, $lte: signalDate } })
        .sort({ date: -1 })
        .limit(1)
        .toArray();
      
      if (latestPreM.length > 0) {
        premarketDate = latestPreM[0].date;
      } else {
        // Check uploaded premarket
        const uploadedPreMCollection = await getUploadedDataCollection('premarket');
        const uploadedPreM = await uploadedPreMCollection
          .find({ date: { $gte: refEodDate, $lte: signalDate } })
          .sort({ date: -1 })
          .limit(1)
          .toArray();
        
        if (uploadedPreM.length > 0) {
          premarketDate = uploadedPreM[0].date;
        }
      }
    } catch (error) {
      console.error('Error checking premarket dates:', error);
    }
  }
  
  // Track if we have premarket for refDate (used in mode detection)
  const hasPremarketForRefDate = premarketDate === refEodDate || hasRefDatePreM;
  
  // Check user override
  const overrideMode = userOverride.mode;
  const isAutoMode = !overrideMode || overrideMode === 'AUTO';
  
  // AUTO mode selection - Check for premarket data FIRST, then fall back to EOD
  // Note: If we reach here, refEodDate is guaranteed to exist (early return above if not)
  if (isAutoMode) {
    // CRITICAL FIX: Check if target date is TODAY and premarket data exists
    // If premarket exists for TODAY (signalDate), use PREMARKET mode
    if (signalDate === today && hasSignalDatePreM && premarketDate) {
      // Check if market is open for LIVE mode
      if (effectiveMarketStatus.isOpen === true) {
        mode = MODE_LIVE;
        reason = `LIVE mode for ${signalDate} (premarket data available, market open)`;
      } else {
        mode = MODE_PREM;
        reason = `PREMARKET mode for ${signalDate} (premarket data available)`;
      }
      console.log(`✅ [Resolver] AUTO mode: Using ${mode === MODE_LIVE ? 'LIVE' : 'PREMARKET'} - premarket data found for ${signalDate}`);
    } else if (premarketDate && premarketDate === signalDate) {
      // Premarket exists for signal date (even if not today)
      if (effectiveMarketStatus.isOpen === true) {
        mode = MODE_LIVE;
        reason = `LIVE mode for ${signalDate} (premarket data available, market open)`;
      } else {
        mode = MODE_PREM;
        reason = `PREMARKET mode for ${signalDate} (premarket data available)`;
      }
      console.log(`✅ [Resolver] AUTO mode: Using ${mode === MODE_LIVE ? 'LIVE' : 'PREMARKET'} - premarket data found for ${signalDate}`);
    } else {
      // No premarket data available, use EOD mode
      mode = MODE_EOD;
      reason = `EOD watchlist for ${signalDate} (bhav data available for ${refEodDate}, no premarket data)`;
      if (!premarketDate) {
        missingFiles.push(`premarket for ${signalDate}`);
      }
      console.log(`ℹ️ [Resolver] AUTO mode: Using EOD - no premarket data for ${signalDate}`);
    }
  } else {
    // User override mode
    const overrideModeUpper = overrideMode.toUpperCase();
    
    if (overrideModeUpper === 'LIVE') {
      mode = hasSignalDatePreM ? MODE_LIVE : MODE_EOD;
      premarketDate = hasSignalDatePreM ? signalDate : premarketDate;
      reason = `User override: LIVE mode${hasSignalDatePreM ? '' : ' (PreM missing, falling back to EOD)'}`;
      if (!hasSignalDatePreM) missingFiles.push(`premarket for ${signalDate}`);
    } else if (overrideModeUpper === 'PREMARKET') {
      mode = hasSignalDatePreM ? MODE_PREM : MODE_EOD;
      premarketDate = hasSignalDatePreM ? signalDate : premarketDate;
      reason = `User override: PREMARKET mode${hasSignalDatePreM ? '' : ' (PreM missing, falling back to EOD)'}`;
      if (!hasSignalDatePreM) missingFiles.push(`premarket for ${signalDate}`);
    } else if (overrideModeUpper === 'EOD') {
      mode = MODE_EOD;
      premarketDate = null;
      reason = `User override: EOD mode`;
    } else {
      // Invalid override, fall back to AUTO
      return await resolveSignalsContext({ targetDate, today, marketStatus: effectiveMarketStatus, userOverride: {} });
    }
  }
  
  // Update missingFiles to reflect what's truly missing
  if (!refEodDate) {
    missingFiles.push(`bhavcopy for ${signalDate}`);
  }
  if (mode === MODE_PREM || mode === MODE_LIVE) {
    if (!premarketDate) {
      missingFiles.push(`premarket for ${signalDate}`);
    }
  }
  
  return {
    signalDate,
    refEodDate,
    premarketDate,
    mode,
    missingFiles,
    reason,
    marketOpen: effectiveMarketStatus.isOpen,
    marketTimestamp: effectiveMarketStatus.timestamp
  };
}

/**
 * Get market session (helper)
 */
function getMarketSession() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffset = 5.5 * 60 * 60000;
  const ist = new Date(utc + istOffset);
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  
  if (timeMinutes >= 540 && timeMinutes < 555) {
    return 'PREMARKET'; // 09:00-09:15
  } else if (timeMinutes >= 555 && timeMinutes < 930) {
    return 'LIVE'; // 09:15-15:30
  } else {
    return 'EOD'; // Outside market hours
  }
}

module.exports = {
  resolveSignalsContext,
  getLatestBhavDate,
  hasPreMForDate
};

