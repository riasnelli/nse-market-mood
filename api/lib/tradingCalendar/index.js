const fs = require('fs');
const path = require('path');

let holidayCache = {};

/**
 * Load holiday list for a given year
 * @param {number} year - Year (e.g., 2025)
 * @returns {Set<string>} - Set of holiday dates in YYYY-MM-DD format
 */
function loadHolidaysForYear(year) {
  if (holidayCache[year]) {
    return holidayCache[year];
  }

  const holidayFile = path.join(__dirname, `nseHolidays.${year}.json`);
  let holidays = new Set();

  try {
    if (fs.existsSync(holidayFile)) {
      const data = JSON.parse(fs.readFileSync(holidayFile, 'utf8'));
      if (data.holidays && Array.isArray(data.holidays)) {
        holidays = new Set(data.holidays);
      }
    }
  } catch (error) {
    console.warn(`[TradingCalendar] Could not load holidays for ${year}:`, error.message);
  }

  holidayCache[year] = holidays;
  return holidays;
}

/**
 * Check if a date is a weekend
 * @param {string|Date} date - Date in YYYY-MM-DD format or Date object
 * @returns {boolean}
 */
function isWeekend(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Check if a date is a trading day (not weekend and not holiday)
 * @param {string|Date} date - Date in YYYY-MM-DD format or Date object
 * @returns {boolean}
 */
function isTradingDay(date) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  
  if (isWeekend(dateStr)) {
    return false;
  }

  const year = new Date(dateStr).getFullYear();
  const holidays = loadHolidaysForYear(year);
  
  return !holidays.has(dateStr);
}

/**
 * Get next trading day (skip weekends and holidays)
 * @param {string} todayDate - Date in YYYY-MM-DD format
 * @returns {string} - Next trading day in YYYY-MM-DD format
 */
function nextTradingDay(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() + 1);
  
  while (!isTradingDay(date)) {
    date.setDate(date.getDate() + 1);
  }
  
  return date.toISOString().split('T')[0];
}

/**
 * Get previous trading day (skip weekends and holidays)
 * @param {string} todayDate - Date in YYYY-MM-DD format
 * @returns {string} - Previous trading day in YYYY-MM-DD format
 */
function prevTradingDay(todayDate) {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  
  while (!isTradingDay(date)) {
    date.setDate(date.getDate() - 1);
  }
  
  return date.toISOString().split('T')[0];
}

/**
 * Resolve signal dates from a target date
 * @param {string} targetDate - Target date in YYYY-MM-DD format
 * @returns {Object} - { signalDate, refDate }
 */
function resolveSignalDates(targetDate) {
  // signalDate is the next trading day on/after targetDate
  let signalDate = targetDate;
  if (!isTradingDay(signalDate)) {
    signalDate = nextTradingDay(signalDate);
  }
  
  // refDate is the previous trading day before signalDate
  const refDate = prevTradingDay(signalDate);
  
  return { signalDate, refDate };
}

/**
 * Check if a date is a holiday
 * @param {string|Date} date - Date in YYYY-MM-DD format or Date object
 * @returns {boolean}
 */
function isHoliday(date) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  const year = new Date(dateStr).getFullYear();
  const holidays = loadHolidaysForYear(year);
  return holidays.has(dateStr);
}

/**
 * Check if calendar fallback is being used (no holiday file for year)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {boolean}
 */
function isCalendarFallbackUsed(date) {
  const year = new Date(date).getFullYear();
  const holidayFile = path.join(__dirname, `nseHolidays.${year}.json`);
  return !fs.existsSync(holidayFile);
}

module.exports = {
  isWeekend,
  isHoliday,
  isTradingDay,
  nextTradingDay,
  prevTradingDay,
  resolveSignalDates,
  isCalendarFallbackUsed,
  loadHolidaysForYear
};

