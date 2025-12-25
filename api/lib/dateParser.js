/**
 * Shared helper for parsing NSE numeric dates (DDMMYYYY format)
 * NSE files use DDMMYYYY format, NOT YYYYMMDD
 * 
 * @param {string|number|null|undefined} value - The date value to parse
 * @returns {string|null} - Date in YYYY-MM-DD format, or null if invalid
 */
function parseNseNumericDate(value) {
  if (!value) return null;
  
  const s = String(value).trim();
  
  // Must be exactly 8 digits
  if (s.length !== 8 || !/^\d{8}$/.test(s)) {
    return null;
  }
  
  // Parse as DDMMYYYY (NSE format)
  const dd = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const yyyy = s.slice(4, 8);
  
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);
  const year = parseInt(yyyy, 10);
  
  // Validate date ranges
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  
  // Return YYYY-MM-DD format
  return `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = {
  parseNseNumericDate
};


