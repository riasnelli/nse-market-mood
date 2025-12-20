/**
 * File Type Detection Module
 * 
 * Provides strict server-side file type classification based on filename patterns.
 * This ensures files are saved to the correct collection and prevents pollution.
 */

/**
 * Detect file type from filename
 * Returns exactly one of: "indices" | "bhav" | "premarket" | "marketactivity" | "52w" | "unknown"
 * 
 * @param {string} fileName - The filename to analyze
 * @returns {string} - The detected file type
 */
function detectFileType(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return 'unknown';
  }

  const normalizedName = fileName.toUpperCase().trim();

  // Pattern 1: Indices files
  // - ind_close_all_YYYYMMDD.csv
  // - MW-All-Indices-*.csv
  if (normalizedName.match(/^IND_CLOSE_ALL_\d{8}\.CSV$/)) {
    return 'indices';
  }
  if (normalizedName.match(/^MW-ALL-INDICES-.*\.CSV$/i)) {
    return 'indices';
  }

  // Pattern 2: Bhavcopy files
  // - sec_bhavdata_full_YYYYMMDD.csv
  // - bhavcopy_YYYYMMDD.csv
  if (normalizedName.match(/^SEC_BHAVDATA_FULL_\d{8}\.CSV$/)) {
    return 'bhav';
  }
  if (normalizedName.match(/^BHAVCOPY_\d{8}\.CSV$/i)) {
    return 'bhav';
  }
  if (normalizedName.match(/.*BHAV.*\.CSV$/i)) {
    return 'bhav';
  }

  // Pattern 3: Premarket files
  // - MW-Pre-Open-Market-<DD-MMM-YYYY>.csv
  // - premarket_YYYYMMDD.csv
  if (normalizedName.match(/^MW-PRE-OPEN-MARKET-.*\.CSV$/i)) {
    return 'premarket';
  }
  if (normalizedName.match(/^PREMARKET_\d{8}\.CSV$/i)) {
    return 'premarket';
  }
  if (normalizedName.match(/.*PRE.*OPEN.*\.CSV$/i) || normalizedName.match(/.*PREMARKET.*\.CSV$/i)) {
    return 'premarket';
  }

  // Pattern 4: Market Activity files
  // - MA<DDMMYY>.csv
  // - marketactivity_YYYYMMDD.csv
  if (normalizedName.match(/^MA\d{6}\.CSV$/)) {
    return 'marketactivity';
  }
  if (normalizedName.match(/^MARKETACTIVITY_\d{8}\.CSV$/i)) {
    return 'marketactivity';
  }
  if (normalizedName.match(/.*MARKET.*ACTIVITY.*\.CSV$/i)) {
    return 'marketactivity';
  }

  // Pattern 5: 52W High/Low files
  // - CM_52_wk_High_low_<DDMMYYYY>.csv
  // - 52w_YYYYMMDD.csv
  if (normalizedName.match(/^CM_52_WK_HIGH_LOW_.*\.CSV$/i)) {
    return '52w';
  }
  if (normalizedName.match(/^52W_\d{8}\.CSV$/i)) {
    return '52w';
  }
  if (normalizedName.match(/.*52.*WK.*\.CSV$/i) || normalizedName.match(/.*52W.*\.CSV$/i)) {
    return '52w';
  }

  // Default: unknown
  return 'unknown';
}

/**
 * Parse date from filename
 * Attempts to extract date in YYYY-MM-DD format from various filename patterns
 * 
 * @param {string} fileName - The filename to parse
 * @returns {string|null} - Date in YYYY-MM-DD format, or null if not found
 */
function parseDateFromFilename(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return null;
  }

  // Pattern 1: YYYYMMDD in filename (e.g., ind_close_all_20251219.csv)
  const yyyymmddMatch = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (yyyymmddMatch) {
    const [, year, month, day] = yyyymmddMatch;
    return `${year}-${month}-${day}`;
  }

  // Pattern 2: DDMMYY in filename (e.g., MA191225.csv -> 2019-12-25)
  const ddmmyyMatch = fileName.match(/(\d{2})(\d{2})(\d{2})\.csv$/i);
  if (ddmmyyMatch) {
    const [, day, month, year] = ddmmyyMatch;
    // Assume 20XX for years
    const fullYear = `20${year}`;
    return `${fullYear}-${month}-${day}`;
  }

  // Pattern 3: DD-MMM-YYYY in filename (e.g., MW-Pre-Open-Market-19-Dec-2025.csv)
  const ddmmyyyyMatch = fileName.match(/(\d{2})-([A-Z]{3})-(\d{4})/i);
  if (ddmmyyyyMatch) {
    const [, day, monthStr, year] = ddmmyyyyMatch;
    const monthMap = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
      'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
      'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = monthMap[monthStr.toUpperCase()] || '01';
    return `${year}-${month}-${day}`;
  }

  // Pattern 4: DDMMYYYY in filename (e.g., CM_52_wk_High_low_19122025.csv)
  const ddmmyyyyMatch2 = fileName.match(/(\d{2})(\d{2})(\d{4})/);
  if (ddmmyyyyMatch2) {
    const [, day, month, year] = ddmmyyyyMatch2;
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Validate file type matches expected type
 * 
 * @param {string} fileName - The filename
 * @param {string} expectedType - The expected type from user selection
 * @returns {Object} - { valid: boolean, detectedType: string, error?: string }
 */
function validateFileType(fileName, expectedType) {
  const detectedType = detectFileType(fileName);
  
  if (detectedType === 'unknown') {
    return {
      valid: false,
      detectedType: 'unknown',
      error: `Cannot determine file type from filename: ${fileName}. Please use a recognized filename pattern.`
    };
  }

  if (detectedType !== expectedType) {
    return {
      valid: false,
      detectedType,
      expectedType,
      error: `File type mismatch: filename suggests "${detectedType}" but you selected "${expectedType}". Please verify the file type.`
    };
  }

  return {
    valid: true,
    detectedType
  };
}

module.exports = {
  detectFileType,
  parseDateFromFilename,
  validateFileType
};

