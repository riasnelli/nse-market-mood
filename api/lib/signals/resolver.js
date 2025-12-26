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
 * @param {string} options.today - Today's date (YYYY-MM-DD)
 * @param {Object} options.marketStatus - { isOpen: boolean, timestamp?: string }
 * @param {Object} options.userOverride - { mode?: string, strategy?: string } from localStorage
 * @returns {Promise<Object>} - { signalDate, refEodDate, premarketDate, mode, missingFiles, reason }
 */
async function resolveSignalsContext({ today, marketStatus = { isOpen: false }, userOverride = {} }) {
  const missingFiles = [];
  let signalDate = null;
  let refEodDate = null;
  let premarketDate = null;
  let mode = MODE_NONE;
  let reason = '';
  
  // Get latest Bhav date (any date <= today)
  const latestBhavDate = await getLatestBhavDate(today);
  
  if (!latestBhavDate) {
    return {
      signalDate: null,
      refEodDate: null,
      premarketDate: null,
      mode: MODE_NONE,
      missingFiles: ['bhavcopy'],
      reason: 'No Bhavcopy data available'
    };
  }
  
  refEodDate = latestBhavDate;
  
  // Check user override
  const overrideMode = userOverride.mode;
  const isAutoMode = !overrideMode || overrideMode === 'AUTO';
  
  // AUTO mode selection
  if (isAutoMode) {
    if (marketStatus.isOpen === true) {
      // Market is open
      const hasTodayPreM = await hasPreMForDate(today);
      
      if (hasTodayPreM) {
        // LIVE mode: today's PreM + latest Bhav
        signalDate = today;
        premarketDate = today;
        mode = MODE_LIVE;
        reason = `Market open with PreM data for today`;
      } else {
        // EOD mode: no PreM, but market is open (unusual but possible)
        signalDate = today;
        premarketDate = null;
        mode = MODE_EOD;
        reason = `Market open but no PreM data for today`;
        missingFiles.push(`premarket for ${today}`);
      }
    } else {
      // Market is closed
      const session = getMarketSession();
      
      // Check if we're in pre-open window (09:00-09:15) and PreM exists for today
      if (session === 'PREMARKET' && await hasPreMForDate(today)) {
        signalDate = today;
        premarketDate = today;
        mode = MODE_PREM;
        reason = `Pre-open window with PreM data for today`;
      } else {
        // After-market: tomorrow signals based on latest Bhav
        signalDate = nextTradingDay(refEodDate);
        const hasSignalDatePreM = await hasPreMForDate(signalDate);
        
        if (hasSignalDatePreM) {
          premarketDate = signalDate;
          mode = MODE_PREM;
          reason = `After-market: signals for ${signalDate} with PreM`;
        } else {
          premarketDate = null;
          mode = MODE_EOD;
          reason = `After-market: watchlist for ${signalDate} (no PreM)`;
        }
      }
    }
  } else {
    // User override mode
    const overrideModeUpper = overrideMode.toUpperCase();
    
    if (overrideModeUpper === 'LIVE') {
      // Force LIVE mode
      const hasTodayPreM = await hasPreMForDate(today);
      signalDate = today;
      refEodDate = latestBhavDate;
      premarketDate = hasTodayPreM ? today : null;
      mode = hasTodayPreM ? MODE_LIVE : MODE_EOD;
      reason = `User override: LIVE mode${hasTodayPreM ? '' : ' (PreM missing, falling back to EOD)'}`;
      if (!hasTodayPreM) missingFiles.push(`premarket for ${today}`);
    } else if (overrideModeUpper === 'PREMARKET') {
      // Force PREMARKET mode
      const hasTodayPreM = await hasPreMForDate(today);
      signalDate = today;
      refEodDate = latestBhavDate;
      premarketDate = hasTodayPreM ? today : null;
      mode = hasTodayPreM ? MODE_PREM : MODE_EOD;
      reason = `User override: PREMARKET mode${hasTodayPreM ? '' : ' (PreM missing, falling back to EOD)'}`;
      if (!hasTodayPreM) missingFiles.push(`premarket for ${today}`);
    } else if (overrideModeUpper === 'EOD') {
      // Force EOD mode
      signalDate = nextTradingDay(refEodDate);
      premarketDate = null;
      mode = MODE_EOD;
      reason = `User override: EOD mode`;
    } else {
      // Invalid override, fall back to AUTO
      return await resolveSignalsContext({ today, marketStatus, userOverride: {} });
    }
  }
  
  return {
    signalDate,
    refEodDate,
    premarketDate,
    mode,
    missingFiles,
    reason,
    marketOpen: marketStatus.isOpen,
    marketTimestamp: marketStatus.timestamp
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

