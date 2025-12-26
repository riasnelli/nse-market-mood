/**
 * Signals Mode Detection Module
 * 
 * Determines the appropriate mode (EOD, PREM, LIVE, NONE) based on:
 * - Selected date
 * - Data availability
 * - Current time (Asia/Kolkata timezone)
 * - Market session windows
 */

const {
  getDailyBhavcopyCollection,
  getPreMarketDataCollection,
  getDailyIndicesCollection,
  getUploadedDataCollection
} = require('../mongodb');
const { isTradingDay, prevTradingDay } = require('../tradingCalendar');

// Mode constants
const MODE_EOD = 'MODE_EOD';
const MODE_PREM = 'MODE_PREM';
const MODE_LIVE = 'MODE_LIVE';
const MODE_NONE = 'MODE_NONE';

/**
 * Get current IST time
 */
function getISTTime() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffset = 5.5 * 60 * 60000; // +5:30
  return new Date(utc + istOffset);
}

/**
 * Check if current time is within market session windows
 */
function getMarketSession() {
  const ist = getISTTime();
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  
  // PreM window: 09:00–09:15 (540-555 minutes)
  // Live window: 09:15–15:30 (555-930 minutes)
  
  if (timeMinutes >= 540 && timeMinutes < 555) {
    return 'PREMARKET'; // 09:00-09:15
  } else if (timeMinutes >= 555 && timeMinutes < 930) {
    return 'LIVE'; // 09:15-15:30
  } else {
    return 'EOD'; // Outside market hours
  }
}

/**
 * Check if EOD data is available for a date
 */
async function hasEODData(date) {
  try {
    const bhavcopyCollection = await getDailyBhavcopyCollection();
    const bhavCount = await bhavcopyCollection.countDocuments({ 
      date: date,
      series: 'EQ'
    });
    
    if (bhavCount > 0) return true;
    
    // Check uploaded bhavcopy
    const uploadedBhavCollection = await getUploadedDataCollection('bhav');
    const uploadedCount = await uploadedBhavCollection.countDocuments({ date: date });
    
    return uploadedCount > 0;
  } catch (error) {
    console.error('Error checking EOD data:', error);
    return false;
  }
}

/**
 * Check if Premarket data is available for a date
 */
async function hasPreMData(date) {
  try {
    const premarketCollection = await getPreMarketDataCollection();
    const preMCount = await premarketCollection.countDocuments({ date: date });
    
    if (preMCount > 0) return true;
    
    // Check uploaded premarket
    const uploadedPreMCollection = await getUploadedDataCollection('premarket');
    const uploadedCount = await uploadedPreMCollection.countDocuments({ date: date });
    
    return uploadedCount > 0;
  } catch (error) {
    console.error('Error checking Premarket data:', error);
    return false;
  }
}

/**
 * Check if live mood data is available (recent indices data)
 */
async function hasLiveMood() {
  try {
    const indicesCollection = await getDailyIndicesCollection();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    // Check for recent mood data (within last 5 minutes)
    const recentData = await indicesCollection
      .find({
        timestamp: { $gte: fiveMinutesAgo.toISOString() },
        mood: { $exists: true }
      })
      .limit(1)
      .toArray();
    
    return recentData.length > 0;
  } catch (error) {
    console.error('Error checking live mood:', error);
    return false;
  }
}

/**
 * Get today's date in YYYY-MM-DD format (IST)
 */
function getTodayIST() {
  const ist = getISTTime();
  return ist.toISOString().split('T')[0];
}

/**
 * Determine signals mode based on selected date, data availability, and time
 * 
 * @param {Object} options
 * @param {string} options.selectedDate - Selected date in YYYY-MM-DD format
 * @param {Date} options.now - Current time (optional, defaults to now)
 * @returns {Promise<Object>} - { mode, reasons[], usedDates: { eodDate, preMDate }, availability }
 */
async function getSignalsMode({ selectedDate, now = null }) {
  const today = getTodayIST();
  const session = getMarketSession();
  const reasons = [];
  const usedDates = {
    eodDate: null,
    preMDate: null
  };
  
  // Determine EOD date (previous trading day for selected date)
  const eodDate = prevTradingDay(selectedDate);
  usedDates.eodDate = eodDate;
  
  // Check data availability
  const availability = {
    eod: await hasEODData(eodDate),
    preM: await hasPreMData(selectedDate),
    live: await hasLiveMood()
  };
  
  // Mode priority logic:
  // 1. If selectedDate == today AND now within LIVE window AND hasPreM(today) => MODE_LIVE
  // 2. Else if hasPreM(selectedDate) => MODE_PREM
  // 3. Else if hasEOD(relevantEodDate) => MODE_EOD
  // 4. Else => MODE_NONE
  
  if (selectedDate === today && session === 'LIVE' && availability.preM) {
    reasons.push(`Selected date is today (${today})`);
    reasons.push(`Current session: LIVE (09:15-15:30 IST)`);
    reasons.push(`Premarket data available for ${selectedDate}`);
    usedDates.preMDate = selectedDate;
    
    return {
      mode: MODE_LIVE,
      reasons,
      usedDates,
      availability,
      session
    };
  }
  
  if (availability.preM) {
    reasons.push(`Premarket data available for ${selectedDate}`);
    usedDates.preMDate = selectedDate;
    
    return {
      mode: MODE_PREM,
      reasons,
      usedDates,
      availability,
      session
    };
  }
  
  if (availability.eod) {
    reasons.push(`EOD data available for ${eodDate}`);
    if (!availability.preM) {
      reasons.push(`Premarket data NOT available for ${selectedDate}`);
    }
    
    return {
      mode: MODE_EOD,
      reasons,
      usedDates,
      availability,
      session
    };
  }
  
  // No data available
  reasons.push(`No EOD data available for ${eodDate}`);
  if (selectedDate === today) {
    reasons.push(`No Premarket data available for ${selectedDate}`);
  }
  
  return {
    mode: MODE_NONE,
    reasons,
    usedDates,
    availability,
    session
  };
}

/**
 * Get mode display name
 */
function getModeDisplayName(mode) {
  const names = {
    [MODE_EOD]: 'EOD',
    [MODE_PREM]: 'PREMARKET',
    [MODE_LIVE]: 'LIVE',
    [MODE_NONE]: 'NONE'
  };
  return names[mode] || mode;
}

/**
 * Get mode description
 */
function getModeDescription(mode) {
  const descriptions = {
    [MODE_EOD]: 'Watchlist (EOD-only, no premarket)',
    [MODE_PREM]: 'Confirmed (Premarket validated)',
    [MODE_LIVE]: 'Live Adjusted (Market open)',
    [MODE_NONE]: 'No Data (Upload required)'
  };
  return descriptions[mode] || mode;
}

module.exports = {
  MODE_EOD,
  MODE_PREM,
  MODE_LIVE,
  MODE_NONE,
  getSignalsMode,
  getModeDisplayName,
  getModeDescription,
  getMarketSession,
  getTodayIST,
  hasEODData,
  hasPreMData,
  hasLiveMood
};

