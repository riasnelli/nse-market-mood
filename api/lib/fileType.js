/**
 * File Type Detection Module
 * 
 * Provides strict server-side file type classification based on filename patterns.
 * This ensures files are saved to the correct collection and prevents pollution.
 */

/**
 * Detect file type from filename (STRICT - single source of truth)
 * Returns exactly one of: "indices" | "bhav" | "premarket" | "marketactivity" | "52w" | "unknown"
 * 
 * STRICT RULES:
 * - Must match exact patterns (no fuzzy matching)
 * - Returns "unknown" if ambiguous or no match
 * - This is the canonical type detector - all other code should use this
 * 
 * @param {string} fileName - The filename to analyze
 * @returns {string} - The detected file type
 */
function detectFileType(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return 'unknown';
  }

  const normalizedName = fileName.toUpperCase().trim();

  // Pattern 1: Indices files (STRICT patterns only)
  // - ind_close_all_YYYYMMDD.csv (exact match)
  // - MW-All-Indices-*.csv (exact prefix match)
  if (normalizedName.match(/^IND_CLOSE_ALL_\d{8}\.CSV$/)) {
    return 'indices';
  }
  if (normalizedName.match(/^MW-ALL-INDICES-.*\.CSV$/i)) {
    return 'indices';
  }

  // Pattern 2: Bhavcopy files (STRICT patterns only)
  // - sec_bhavdata_full_YYYYMMDD.csv (exact match)
  // - bhavcopy_YYYYMMDD.csv (exact prefix match)
  // - sec_bhavdata_*.csv (NSE official format)
  if (normalizedName.match(/^SEC_BHAVDATA_FULL_\d{8}\.CSV$/)) {
    return 'bhav';
  }
  if (normalizedName.match(/^SEC_BHAVDATA_.*\.CSV$/i)) {
    return 'bhav';
  }
  if (normalizedName.match(/^BHAVCOPY_\d{8}\.CSV$/i)) {
    return 'bhav';
  }
  // More specific: must contain "bhav" AND not be indices or premarket
  if (normalizedName.includes('BHAV') && 
      !normalizedName.includes('IND') && 
      !normalizedName.includes('PRE') &&
      normalizedName.endsWith('.CSV')) {
    return 'bhav';
  }

  // Pattern 3: Premarket files (STRICT patterns only)
  // - MW-Pre-Open-Market-<DD-MMM-YYYY>.csv (exact prefix match)
  // - premarket_YYYYMMDD.csv (exact prefix match)
  if (normalizedName.match(/^MW-PRE-OPEN-MARKET-.*\.CSV$/i)) {
    return 'premarket';
  }
  if (normalizedName.match(/^PREMARKET_\d{8}\.CSV$/i)) {
    return 'premarket';
  }
  // More specific: must contain "PRE" AND "OPEN" or "MARKET" (but not "PREMIUM")
  if ((normalizedName.includes('PRE') && normalizedName.includes('OPEN')) ||
      (normalizedName.includes('PREMARKET') && !normalizedName.includes('PREMIUM'))) {
    if (normalizedName.endsWith('.CSV')) {
      return 'premarket';
    }
  }

  // Pattern 4: Market Activity files (STRICT patterns only)
  // - MA<DDMMYY>.csv (exact 6-digit pattern)
  // - marketactivity_YYYYMMDD.csv (exact prefix match)
  if (normalizedName.match(/^MA\d{6}\.CSV$/)) {
    return 'marketactivity';
  }
  if (normalizedName.match(/^MARKETACTIVITY_\d{8}\.CSV$/i)) {
    return 'marketactivity';
  }
  // More specific: must contain "MARKET" AND "ACTIVITY" (not "52" or "WK")
  if (normalizedName.includes('MARKET') && 
      normalizedName.includes('ACTIVITY') &&
      !normalizedName.includes('52') &&
      !normalizedName.includes('WK') &&
      normalizedName.endsWith('.CSV')) {
    return 'marketactivity';
  }

  // Pattern 5: 52W High/Low files (STRICT patterns only)
  // - CM_52_wk_High_low_<DDMMYYYY>.csv (exact prefix match)
  // - 52w_YYYYMMDD.csv (exact prefix match)
  if (normalizedName.match(/^CM_52_WK_HIGH_LOW_.*\.CSV$/i)) {
    return '52w';
  }
  if (normalizedName.match(/^CM_52.*WK.*\.CSV$/i)) {
    return '52w';
  }
  if (normalizedName.match(/^52W_\d{8}\.CSV$/i)) {
    return '52w';
  }
  // More specific: must contain "52" AND ("WK" or "WEEK") (not "52W" in marketactivity)
  if ((normalizedName.includes('52') && (normalizedName.includes('WK') || normalizedName.includes('WEEK'))) &&
      !normalizedName.includes('MARKETACTIVITY') &&
      normalizedName.endsWith('.CSV')) {
    return '52w';
  }

  // Default: unknown (STRICT - no fuzzy matching)
  return 'unknown';
}

/**
 * Parse date from NSE filename (centralized, robust parser)
 * Extracts DDMMYYYY sequence and converts to YYYY-MM-DD format
 * 
 * Expected patterns:
 * - CM_52_wk_High_low_22122025.csv → 2025-12-22
 * - sec_bhavdata_full_23122025.csv → 2025-12-23
 * - ind_close_all_22122025.csv → 2025-12-22
 * - MA191225.csv → 2025-12-19 (DDMMYY format)
 * 
 * @param {string} fileName - The filename to parse
 * @returns {string|null} - Date in YYYY-MM-DD format, or null if not found/invalid
 * @throws {Error} - If date is found but invalid (out of range)
 */
function parseDateFromFilename(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return null;
  }

  // Pattern 1: DDMMYYYY (8 digits) - most common for NSE files
  // e.g., CM_52_wk_High_low_22122025.csv, sec_bhavdata_full_23122025.csv
  const ddmmyyyyMatch = fileName.match(/(\d{2})(\d{2})(\d{4})/);
  if (ddmmyyyyMatch) {
    const [, dd, mm, yyyy] = ddmmyyyyMatch;
    const day = Number(dd);
    const month = Number(mm);
    const year = Number(yyyy);

    // Validate date range
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(
        `Invalid parsed date from filename ${fileName}: ${year}-${month}-${day}. ` +
        `Year must be 2000-2100, month 1-12, day 1-31.`
      );
    }

    return `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Pattern 2: YYYYMMDD (8 digits) - alternative format
  // e.g., ind_close_all_20251219.csv
  const yyyymmddMatch = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (yyyymmddMatch) {
    const [, year, month, day] = yyyymmddMatch;
    const yearNum = Number(year);
    const monthNum = Number(month);
    const dayNum = Number(day);

    // Validate date range
    if (yearNum < 2000 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      throw new Error(
        `Invalid parsed date from filename ${fileName}: ${year}-${month}-${day}. ` +
        `Year must be 2000-2100, month 1-12, day 1-31.`
      );
    }

    return `${year}-${month}-${day}`;
  }

  // Pattern 3: DDMMYY (6 digits at end) - for MA files
  // e.g., MA191225.csv -> 2025-12-19
  const ddmmyyMatch = fileName.match(/(\d{2})(\d{2})(\d{2})\.csv$/i);
  if (ddmmyyMatch) {
    const [, day, month, yy] = ddmmyyMatch;
    // Assume 20XX for years
    const year = `20${yy}`;
    const yearNum = Number(year);
    const monthNum = Number(month);
    const dayNum = Number(day);

    // Validate date range
    if (yearNum < 2000 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      throw new Error(
        `Invalid parsed date from filename ${fileName}: ${year}-${month}-${day}. ` +
        `Year must be 2000-2100, month 1-12, day 1-31.`
      );
    }

    return `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }

  // Pattern 4: DD-MMM-YYYY in filename (e.g., MW-Pre-Open-Market-19-Dec-2025.csv)
  const ddmmyyyyMatch = fileName.match(/(\d{2})-([A-Z]{3})-(\d{4})/i);
  if (ddmmyyyyMatch) {
    const [, day, monthStr, year] = ddmmyyyyMatch;
    const monthMap = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
      'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
      'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = monthMap[monthStr.toUpperCase()] || '01';
    const yearNum = Number(year);
    const monthNum = Number(month);
    const dayNum = Number(day);

    // Validate date range
    if (yearNum < 2000 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      throw new Error(
        `Invalid parsed date from filename ${fileName}: ${year}-${month}-${day}. ` +
        `Year must be 2000-2100, month 1-12, day 1-31.`
      );
    }

    return `${year}-${month}-${String(dayNum).padStart(2, '0')}`;
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

/**
 * Get canonical type name (normalize variations)
 * @param {string} type - Type string (may have variations)
 * @returns {string} - Canonical type name
 */
function getCanonicalType(type) {
  if (!type) return 'unknown';
  const normalized = (type || '').toLowerCase().trim();
  const map = {
    'indices': 'indices',
    'bhav': 'bhav',
    'bhavcopy': 'bhav',
    'premarket': 'premarket',
    'pre-market': 'premarket',
    'pre_open': 'premarket',
    'marketactivity': 'marketactivity',
    'market_activity': 'marketactivity',
    'ma': 'marketactivity',
    '52w': '52w',
    '52_wk': '52w',
    '52_week': '52w',
    'week52': '52w'
  };
  return map[normalized] || 'unknown';
}

module.exports = {
  detectFileType,
  parseDateFromFilename,
  validateFileType,
  getCanonicalType
};

