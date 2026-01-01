/**
 * NSE CSV Normalization Layer
 * Robust parsers for various NSE CSV formats with multiline header support
 */

// Debug flag - set to true to enable verbose logging
const DEBUG = false;

/**
 * Helper: Get field value from row trying multiple key candidates with case variations
 * @param {Object} row - The row object
 * @param {string[]} candidates - Array of possible field names to try
 * @returns {*} The field value or null if not found
 */
function getField(row, candidates) {
    if (!row || !candidates || !Array.isArray(candidates)) return null;
    
    for (const key of candidates) {
        // Try exact match
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
            return row[key];
        }
        // Try uppercase
        const upper = key.toUpperCase();
        if (row[upper] !== undefined && row[upper] !== null && String(row[upper]).trim() !== "") {
            return row[upper];
        }
        // Try lowercase
        const lower = key.toLowerCase();
        if (row[lower] !== undefined && row[lower] !== null && String(row[lower]).trim() !== "") {
            return row[lower];
        }
        // Try with underscores instead of spaces
        const underscoreKey = key.replace(/\s+/g, '_');
        if (underscoreKey !== key && row[underscoreKey] !== undefined && row[underscoreKey] !== null && String(row[underscoreKey]).trim() !== "") {
            return row[underscoreKey];
        }
        const underscoreUpper = underscoreKey.toUpperCase();
        if (row[underscoreUpper] !== undefined && row[underscoreUpper] !== null && String(row[underscoreUpper]).trim() !== "") {
            return row[underscoreUpper];
        }
    }
    return null;
}

/**
 * Helper: Parse number safely (remove commas, trim, return Number or null)
 */
function parseNumberSafe(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).replace(/,/g, "").trim();
    if (!str) return null;
    const num = Number(str);
    return Number.isFinite(num) ? num : null;
}

/**
 * Helper: Clean number value (remove commas, trim, return Number or null)
 * @deprecated Use parseNumberSafe instead for consistency
 */
function cleanNumber(value) {
    return parseNumberSafe(value);
}

/**
 * Helper: Clean header string (trim, remove newlines, collapse spaces)
 */
function cleanHeader(s) {
    if (!s) return '';
    return String(s).trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Helper: Normalize date to YYYY-MM-DD format
 * Handles various formats including DD-MMM-YYYY (e.g., "23-JUL-2025")
 */
function normalizeDate(input) {
    if (!input) return null;
    
    // Trim whitespace and remove quotes
    const trimmed = String(input).trim().replace(/^["']|["']$/g, '');
    if (!trimmed) return null;
    
    // If already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }
    
    // Try DD-MMM-YYYY or DD/MMM/YYYY (e.g., "23-JUL-2025", "23/JUL/2025")
    // Also handle 2-digit years: DD-MMM-YY (e.g., "26-Dec-24" → "2024-12-26")
    const ddmmyyyyMatch = trimmed.match(/(\d{1,2})[-\/]([A-Z]{3})[-\/](\d{2,4})/i);
    if (ddmmyyyyMatch) {
        const [, day, monthStr, yearStr] = ddmmyyyyMatch;
        const monthMap = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
            'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
            'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };
        const month = monthMap[monthStr.toUpperCase()];
        if (month) {
            const dayNum = parseInt(day, 10);
            // Handle 2-digit years: assume 20XX for years 00-99
            let yearNum = parseInt(yearStr, 10);
            if (yearStr.length === 2) {
                yearNum = 2000 + yearNum;
            }
            if (yearNum >= 2000 && yearNum <= 2100 && dayNum >= 1 && dayNum <= 31) {
                return `${yearNum}-${month}-${String(dayNum).padStart(2, '0')}`;
            }
        }
    }
    
    // Try parsing as Date (handles many formats)
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        // Only accept if year is reasonable (2000-2100)
        if (year >= 2000 && year <= 2100) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
        }
    }
    
    // Try DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyy = trimmed.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/);
    if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy.map(Number);
        if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    
    // Try YYYYMMDD (8 digits)
    const yyyymmdd = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (yyyymmdd) {
        const [, year, month, day] = yyyymmdd.map(Number);
        if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    
    return null;
}

/**
 * Detect and fix NSE multiline header CSV
 * Some NSE CSVs have headers split across multiple lines
 */
function detectAndFixNseMultilineHeaderCsv(text) {
    // Remove UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    
    const lines = text.split(/\r?\n/).map(l => l.trim());
    if (lines.length < 2) return text;
    
    // Look for multiline header pattern
    // Headers often split like: "SYMBOL \n","PREV. CLOSE \n","IEP \n"...
    let headerEndIndex = -1;
    let reconstructedHeader = [];
    
    // Search first 20 lines for header fragments
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (!line || line.length === 0) continue;
        
        // Check if line is just a quote or blank terminator
        if (line.match(/^["\s]*$/)) {
            if (reconstructedHeader.length > 0) {
                headerEndIndex = i;
                break;
            }
            continue;
        }
        
        // Check if line contains header-like content
        const lineUpper = line.toUpperCase();
        const hasHeaderKeywords = lineUpper.includes('SYMBOL') || 
                                 lineUpper.includes('PREV') || 
                                 lineUpper.includes('CLOSE') ||
                                 lineUpper.includes('INDEX') ||
                                 lineUpper.includes('OPEN') ||
                                 lineUpper.includes('HIGH') ||
                                 lineUpper.includes('LOW');
        
        if (hasHeaderKeywords) {
            // Parse this line as CSV to extract header fragments
            const cells = parseCSVLine(line);
            reconstructedHeader = reconstructedHeader.concat(cells.map(cleanHeader));
        } else if (reconstructedHeader.length > 0) {
            // We've been collecting headers, now hit data - stop here
            headerEndIndex = i;
            break;
        }
    }
    
    // If we found a multiline header, reconstruct
    if (reconstructedHeader.length > 0 && headerEndIndex > 0) {
        const headerRow = reconstructedHeader.join(',');
        const dataRows = lines.slice(headerEndIndex).join('\n');
        return headerRow + '\n' + dataRows;
    }
    
    return text;
}

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

/**
 * Parse Pre-Open Market CSV (MW-Pre-Open-Market-*.csv)
 */
function parsePreOpenCsv(text) {
    text = detectAndFixNseMultilineHeaderCsv(text);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
        return { rows: [], errors: ['CSV file is empty or invalid'] };
    }
    
    // Find header row
    let headerRowIndex = -1;
    let headers = [];
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const lineUpper = lines[i].toUpperCase();
        if (lineUpper.includes('SYMBOL') && (lineUpper.includes('PREV') || lineUpper.includes('IEP'))) {
            headers = parseCSVLine(lines[i]).map(cleanHeader);
            headerRowIndex = i;
            break;
        }
    }
    
    // Fallback to standard header
    if (headers.length === 0) {
        headers = ['SYMBOL', 'PREV. CLOSE', 'IEP', 'CHNG', '%CHNG', 'FINAL', 'FINAL QUANTITY'];
        headerRowIndex = 0;
    }
    
    const rows = [];
    const errors = [];
    
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        if (cells.length === 0) continue;
        
        const row = {};
        headers.forEach((header, idx) => {
            if (idx < cells.length) {
                row[header.toUpperCase()] = cells[idx];
            }
        });
        
        const symbol = (row.SYMBOL || '').trim();
        
        // Skip header-like rows
        if (!symbol || symbol === 'SYMBOL' || symbol.toUpperCase().includes('SYMBOL')) continue;
        
        // Skip footer rows
        if (symbol.includes('(₹ Crores)') || symbol.length > 50) continue;
        
        // Normalize fields
        const normalized = {
            symbol: symbol.toUpperCase(),
            prevClose: cleanNumber(row['PREV. CLOSE'] || row['PREV CLOSE'] || row['PREVCLOSE'] || row['PREV_CLOSE']),
            iep: cleanNumber(row.IEP || row['IEP'] || row['PRE OPEN PRICE'] || row['PRE_OPEN_PRICE']),
            chng: cleanNumber(row.CHNG || row['CHNG'] || row['CHANGE']),
            chngPct: cleanNumber(row['%CHNG'] || row['CHNG%'] || row['CHANGE%'] || row['PCHANGE']),
            final: cleanNumber(row.FINAL || row['FINAL'] || row['FINAL PRICE']),
            finalQty: cleanNumber(row['FINAL QUANTITY'] || row['FINAL_QTY'] || row['QUANTITY'])
        };
        
        // Accept row if it has symbol and at least one price field (prevClose OR iep OR final)
        // This is more lenient - some rows might have FINAL but not IEP, or vice versa
        const hasPrice = normalized.prevClose !== null || normalized.iep !== null || normalized.final !== null;
        if (normalized.symbol && hasPrice) {
            // If IEP is null but FINAL exists, use FINAL as IEP
            if (normalized.iep === null && normalized.final !== null) {
                normalized.iep = normalized.final;
            }
            // If prevClose is null but we have other data, try to calculate it
            if (normalized.prevClose === null && normalized.iep !== null && normalized.chngPct !== null && normalized.chngPct !== -100) {
                normalized.prevClose = normalized.iep / (1 + normalized.chngPct / 100);
            }
            rows.push(normalized);
        }
    }
    
    if (DEBUG) console.log(`Parsed ${rows.length} pre-open rows`);
    
    return { rows, errors, metadata: { rowCount: rows.length, columns: headers } };
}

/**
 * Parse All Indices CSV (MW-All-Indices-*.csv)
 */
function parseAllIndicesCsv(text) {
    text = detectAndFixNseMultilineHeaderCsv(text);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
        return { rows: [], errors: ['CSV file is empty or invalid'] };
    }
    
    // Find header row
    let headerRowIndex = -1;
    let headers = [];
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const lineUpper = lines[i].toUpperCase();
        if (lineUpper.includes('INDEX') && (lineUpper.includes('CLOSE') || lineUpper.includes('VALUE'))) {
            headers = parseCSVLine(lines[i]).map(cleanHeader);
            headerRowIndex = i;
            break;
        }
    }
    
    const rows = [];
    const errors = [];
    
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]);
        if (cells.length === 0) continue;
        
        const row = {};
        headers.forEach((header, idx) => {
            if (idx < cells.length) {
                row[header.toUpperCase()] = cells[idx];
            }
        });
        
        const name = (row['INDEX NAME'] || row['INDEX'] || row['NAME'] || row['SYMBOL'] || '').trim();
        
        // Skip header-like rows
        if (!name || name.toUpperCase().includes('INDEX NAME') || name.toUpperCase().includes('INDEX DATE')) continue;
        
        // Normalize fields
        const ltp = cleanNumber(row['CLOSING INDEX VALUE'] || row['CLOSING INDEX'] || row['CLOSE'] || row['LTP'] || row['LAST_PRICE']);
        const changePct = cleanNumber(row['CHANGE(%)'] || row['CHANGE %'] || row['CHANGE'] || row['PCHANGE'] || row['%CHANGE']);
        const change = cleanNumber(row['POINTS CHANGE'] || row['CHANGE'] || row['CHG']);
        const open = cleanNumber(row.OPEN || row['OPEN']);
        const high = cleanNumber(row.HIGH || row['HIGH']);
        const low = cleanNumber(row.LOW || row['LOW']);
        const prevClose = cleanNumber(row['PREVIOUS CL'] || row['PREV CLOSE'] || row['PREVCLOSE'] || row['PREV_CLOSE']);
        
        // Calculate prevClose if not available
        let calculatedPrevClose = prevClose;
        if (calculatedPrevClose === null && ltp !== null && changePct !== null && changePct !== -100) {
            calculatedPrevClose = ltp / (1 + changePct / 100);
        }
        
        const normalized = {
            symbol: name.toUpperCase(),
            lastPrice: ltp,
            close: ltp,
            open: open,
            high: high,
            low: low,
            change: change,
            changePct: changePct,
            prevClose: calculatedPrevClose || prevClose
        };
        
        if (normalized.symbol && normalized.lastPrice !== null) {
            rows.push(normalized);
        }
    }
    
    if (DEBUG) console.log(`Parsed ${rows.length} indices rows`);
    
    return { rows, errors, metadata: { rowCount: rows.length, columns: headers } };
}

/**
 * Parse Bhavcopy CSV (sec_bhavdata_full_*.csv or cm*.csv)
 * 
 * Real NSE format:
 * - Line 1: Header row with "SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, ..." (spaces after commas)
 * - Lines 2+: Data rows
 * - Columns are comma-separated with optional spaces after commas
 */
function parseBhavcopyCsv(text) {
    // Remove UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    
    const lines = text.split(/\r?\n/);
    
    if (lines.length < 2) {
        return { rows: [], errors: ['CSV file is empty or invalid'] };
    }
    
    // Find header row (should be first line, but search first 5 lines to be safe)
    let headerRowIndex = -1;
    let headers = [];
    
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        const lineUpper = line.toUpperCase();
        // Look for header with SYMBOL/SERIES (old format) or TckrSymb/SctySrs (new UDIFF format)
        const hasSymbolHeader = lineUpper.includes('SYMBOL') || lineUpper.includes('TCKRSYMB');
        const hasSeriesHeader = lineUpper.includes('SERIES') || lineUpper.includes('SCTYSRS');
        const hasPriceHeader = lineUpper.includes('OPEN') || lineUpper.includes('OPNPRIC');
        if (hasSymbolHeader && (hasSeriesHeader || hasPriceHeader)) {
            // Parse CSV line (handles spaces after commas and quoted fields)
            headers = parseCSVLine(line).map(cleanHeader);
            headerRowIndex = i;
            break;
        }
    }
    
    // Fallback to standard bhavcopy header if not found
    if (headers.length === 0) {
        headers = ['SYMBOL', 'SERIES', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'LAST', 'PREVCLOSE', 'TOTTRDQTY', 'TOTTRDVAL', 'TIMESTAMP'];
        headerRowIndex = 0;
    }
    
    const rows = [];
    const errors = [];
    let skippedNoSymbol = 0;
    let skippedNotEq = 0;
    let skippedInvalidClose = 0;
    
    // Process data rows after header
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        
        // Skip empty lines
        if (!line) continue;
        
        // Parse CSV line (handles spaces after commas and quoted fields)
        const cells = parseCSVLine(line);
        if (cells.length === 0) continue;
        
        const row = {};
        headers.forEach((header, idx) => {
            if (idx < cells.length) {
                // Trim and remove surrounding quotes from cell value
                let cellValue = cells[idx].trim();
                cellValue = cellValue.replace(/^["']|["']$/g, '');
                row[header.toUpperCase()] = cellValue;
            }
        });
        
        // Support both old format (SYMBOL, SERIES) and new UDIFF format (TckrSymb, SctySrs)
        const symbol = (row.TckrSymb || row.tckrSymb || row.TCKRSYMB || // New UDIFF format
                        row.SYMBOL || '').trim();
        const series = (row.SctySrs || row.sctySrs || row.SCTYSRS || // New UDIFF format
                        row.SERIES || '').trim().toUpperCase();
        
        // Skip header-like rows
        if (!symbol || symbol === 'SYMBOL') {
            skippedNoSymbol++;
            continue;
        }
        
        // Filter for EQ series (or assume EQ if SERIES column missing)
        const hasSeriesColumn = headers.some(h => h.toUpperCase().includes('SERIES'));
        if (hasSeriesColumn && series && series !== 'EQ') {
            skippedNotEq++;
            continue;
        }
        
        // Extract prices - handle various field name formats
        // OLD FORMAT: CLOSE_PRICE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, PREV_CLOSE, TTL_TRD_QNTY, TOTTRDQTY
        // NEW UDIFF FORMAT (CM segment): ClsPric, OpnPric, HghPric, LwPric, PrvsClsgPric, TtlTradgVol
        const close = cleanNumber(
            // New UDIFF format (CM)
            row.ClsPric || row.clsPric || row.CLSPRIC ||
            // Old format variations
            row.CLOSE_PRICE || 
            row.CLOSE || 
            row['CLOSE_PRIC'] || 
            row['LAST_PRICE'] || 
            row.LastPric || row.lastPric || row.LASTPRIC || // New format LAST
            row.LAST ||
            row.LAST_PRICE
        );
        const open = cleanNumber(
            // New UDIFF format (CM)
            row.OpnPric || row.opnPric || row.OPNPRIC ||
            // Old format variations
            row.OPEN_PRICE || 
            row.OPEN
        );
        const high = cleanNumber(
            // New UDIFF format (CM)
            row.HghPric || row.hghPric || row.HGHPRIC ||
            // Old format variations
            row.HIGH_PRICE || 
            row.HIGH
        );
        const low = cleanNumber(
            // New UDIFF format (CM)
            row.LwPric || row.lwPric || row.LWPRIC ||
            // Old format variations
            row.LOW_PRICE || 
            row.LOW
        );
        const prevClose = cleanNumber(
            // New UDIFF format (CM)
            row.PrvsClsgPric || row.prvsClsgPric || row.PRVSCLSGPRIC ||
            // Old format variations
            row.PREV_CLOSE || 
            row.PREVCLOSE || 
            row['PREVCLOSE_PRICE']
        );
        const volume = cleanNumber(
            // New UDIFF format (CM)
            row.TtlTradgVol || row.ttlTradgVol || row.TTLTRADGVOL ||
            // Old format variations
            row.TTL_TRD_QNTY ||
            row.TOTTRDQTY || 
            row['TTL_TRD_QN'] || 
            row.VOLUME
        );
        const delivery = cleanNumber(
            row.DELIV_QTY || 
            row.DELIVERY
        );
        const deliveryPercent = cleanNumber(
            row.DELIV_PER || 
            row['DELIVERY_PER']
        );
        
        if (close === null || close <= 0) {
            skippedInvalidClose++;
            continue;
        }
        
        // Calculate day return and range
        const dayRetPct = prevClose ? ((close - prevClose) / prevClose) * 100 : null;
        const rangePct = high && low ? ((high - low) / low) * 100 : null;
        
        rows.push({
            symbol: symbol.toUpperCase(),
            series: series || 'EQ',
            open: open,
            high: high,
            low: low,
            close: close,
            prevClose: prevClose,
            volume: volume,
            delivery: delivery,
            deliveryPercent: deliveryPercent,
            dayRetPct: dayRetPct,
            rangePct: rangePct
        });
    }
    
    if (DEBUG) {
        console.log(`Parsed ${rows.length} bhavcopy rows`);
        console.log(`Skipped: ${skippedNoSymbol} (no symbol), ${skippedNotEq} (not EQ), ${skippedInvalidClose} (invalid close)`);
    }
    
    return {
        rows,
        errors,
        metadata: {
            rowCount: rows.length,
            columns: headers,
            skipped: { noSymbol: skippedNoSymbol, notEq: skippedNotEq, invalidClose: skippedInvalidClose }
        }
    };
}

/**
 * Parse Indices Snapshot CSV (similar to All Indices)
 */
function parseIndiSnapshotCsv(text) {
    return parseAllIndicesCsv(text);
}

/**
 * Parse 52 Week High/Low CSV (CM_52_wk_High_low_*.csv)
 * 
 * Real NSE format:
 * - Line 1: Disclaimer text
 * - Line 2: "Effective for DD-MMM-YYYY"
 * - Line 3: Header row with "SYMBOL","SERIES","Adjusted_52_Week_High",...
 * - Lines 4+: Data rows
 */
function parse52wCsv(text) {
    // Remove UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    
    const lines = text.split(/\r?\n/);
    
    if (lines.length < 2) {
        return { rows: [], errors: ['CSV file is empty or invalid'] };
    }
    
    // Find header row - skip disclaimer and "Effective for" lines
    let headerRowIndex = -1;
    let headers = [];
    let headerFound = false;
    
    for (let i = 0; i < Math.min(50, lines.length); i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        
        // Skip completely empty lines
        if (!line) continue;
        
        const lineUpper = line.toUpperCase();
        
        // Skip disclaimer lines
        if (lineUpper.includes('DISCLAIMER') || lineUpper.includes('NOTE') || lineUpper.includes('COPYRIGHT')) {
            continue;
        }
        
        // Skip "Effective for" line
        if (lineUpper.includes('EFFECTIVE FOR') || lineUpper.includes('EFFECTIVE')) {
            continue;
        }
        
        // Look for header: must have "SYMBOL" AND "SERIES" (most reliable indicator)
        // Also tolerate variations like "52_WK_HIGH", "52 Week High", etc.
        if (lineUpper.includes('SYMBOL') && lineUpper.includes('SERIES')) {
            const parsedHeaders = parseCSVLine(line);
            // Normalize headers: trim, uppercase, and handle variations
            headers = parsedHeaders.map(h => {
                let normalized = cleanHeader(h);
                // Normalize common variations
                normalized = normalized.toUpperCase().trim();
                // Handle variations like "52_WK_HIGH" -> "52_WEEK_HIGH"
                normalized = normalized.replace(/52_WK_/g, '52_WEEK_');
                normalized = normalized.replace(/52\s+WK\s+/gi, '52_WEEK_');
                normalized = normalized.replace(/\s+/g, '_'); // Replace spaces with underscores
                return normalized;
            });
            headerRowIndex = i;
            headerFound = true;
            console.log('✅ 52W parser: Found header at line', i + 1, ':', headers);
            break;
        }
    }
    
    if (!headerFound) {
        if (DEBUG) {
            console.error('❌ 52W parser: Could not find header row with SYMBOL and SERIES columns');
            console.error('   First 10 lines:', lines.slice(0, 10));
        }
        return { 
            rows: [], 
            errors: ['Could not find header row with SYMBOL and SERIES columns'] 
        };
    }
    
    // Header logging already done above
    
    const rows = [];
    const errors = [];
    let skippedEmpty = 0;
    let skippedInvalid = 0;
    
    // Process data rows after header
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        
        // Skip empty lines
        if (!line) {
            skippedEmpty++;
            continue;
        }
        
        // Parse CSV line (handles quoted fields)
        const cells = parseCSVLine(line);
        if (cells.length < 2) {
            skippedInvalid++;
            continue;
        }
        
        // Map cells to header columns
        const row = {};
        headers.forEach((header, idx) => {
            if (idx < cells.length) {
                // Trim and remove surrounding quotes from cell value
                let cellValue = cells[idx].trim();
                cellValue = cellValue.replace(/^["']|["']$/g, '');
                // Store with uppercase key for consistent access
                // Clean the header name: remove quotes, normalize spaces/underscores
                const headerKey = header.toUpperCase().trim().replace(/^["']|["']$/g, '');
                row[headerKey] = cellValue;
            }
        });
        
        // Debug: Log first row to verify field names match (always log if no rows yet)
        if (rows.length === 0 && i === headerRowIndex + 1) {
            console.log('🔍 52W parser - First data row after header:');
            console.log('   Headers found:', headers);
            console.log('   All row keys:', Object.keys(row));
            console.log('   Full row object:', row);
            console.log('   Sample values:', {
                SYMBOL: row.SYMBOL,
                SERIES: row.SERIES,
                ADJUSTED_52_WEEK_HIGH: row['ADJUSTED_52_WEEK_HIGH'],
                '52_WEEK_HIGH_DATE': row['52_WEEK_HIGH_DATE'],
                ADJUSTED_52_WEEK_LOW: row['ADJUSTED_52_WEEK_LOW'],
                '52_WEEK_LOW_DT': row['52_WEEK_LOW_DT']
            });
        }
        
        // Extract symbol and series
        const symbol = (row.SYMBOL || '').trim().replace(/^["']|["']$/g, '');
        const series = (row.SERIES || '').trim().replace(/^["']|["']$/g, '').toUpperCase();
        
        // Skip header-like rows (case-insensitive check)
        if (!symbol || symbol.toUpperCase() === 'SYMBOL' || symbol.includes('DISCLAIMER')) {
            skippedInvalid++;
            continue;
        }
        
        // Skip if symbol is empty after cleaning
        if (!symbol || symbol.length === 0) {
            skippedInvalid++;
            continue;
        }
        
        // Helper function to get field value trying multiple key variations
        const getField = (candidates) => {
            for (const key of candidates) {
                // Try exact match
                if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
                    return row[key];
                }
                // Try uppercase variant
                const upper = key.toUpperCase();
                if (row[upper] !== undefined && row[upper] !== null && String(row[upper]).trim() !== '') {
                    return row[upper];
                }
                // Try lowercase variant
                const lower = key.toLowerCase();
                if (row[lower] !== undefined && row[lower] !== null && String(row[lower]).trim() !== '') {
                    return row[lower];
                }
                // Try with spaces replaced by underscores and vice versa
                const withUnderscores = key.replace(/\s+/g, '_');
                if (row[withUnderscores] !== undefined && row[withUnderscores] !== null && String(row[withUnderscores]).trim() !== '') {
                    return row[withUnderscores];
                }
                const withSpaces = key.replace(/_/g, ' ');
                if (row[withSpaces] !== undefined && row[withSpaces] !== null && String(row[withSpaces]).trim() !== '') {
                    return row[withSpaces];
                }
            }
            // Final fallback: search all row keys case-insensitively
            const rowKeys = Object.keys(row);
            for (const candidate of candidates) {
                const candidateUpper = candidate.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
                for (const key of rowKeys) {
                    const keyUpper = key.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
                    if (keyUpper === candidateUpper || keyUpper.includes(candidateUpper) || candidateUpper.includes(keyUpper)) {
                        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
                            return row[key];
                        }
                    }
                }
            }
            return null;
        };
        
        // Extract 52W high/low values - handle various field name formats
        // New format uses: "Adjusted_52_Week_High", "52_Week_High_Date", "Adjusted_52_Week_Low", "52_Week_Low_DT"
        // Old format might use: "HIGH_52W", "HIGH_DATE", "LOW_52W", "LOW_DATE"
        const high52wValue = getField([
            'ADJUSTED_52_WEEK_HIGH',
            'Adjusted_52_Week_High',
            'ADJUSTED 52 WEEK HIGH',
            'HIGH_52W',
            '52W_HIGH',
            '52_WEEK_HIGH',
            'HIGH'
        ]);
        const high52w = cleanNumber(high52wValue);
        
        const low52wValue = getField([
            'ADJUSTED_52_WEEK_LOW',
            'Adjusted_52_Week_Low',
            'ADJUSTED 52 WEEK LOW',
            'LOW_52W',
            '52W_LOW',
            '52_WEEK_LOW',
            'LOW'
        ]);
        const low52w = cleanNumber(low52wValue);
        
        const high52wDateValue = getField([
            '52_WEEK_HIGH_DATE',
            '52_Week_High_Date',
            '52 WEEK HIGH DATE',
            'HIGH_DATE',
            'HIGH DATE',
            '52_WEEK_HIGH_DT',
            'HIGH_DT'
        ]);
        const high52wDate = normalizeDate(high52wDateValue);
        
        const low52wDateValue = getField([
            '52_WEEK_LOW_DT',
            '52_Week_Low_DT',
            '52 WEEK LOW DT',
            '52_WEEK_LOW_DATE',
            '52 WEEK LOW DATE',
            'LOW_DATE',
            'LOW DATE',
            'LOW_DT'
        ]);
        const low52wDate = normalizeDate(low52wDateValue);
        
        // Accept row if it has symbol and at least one 52W value (high or low)
        if (symbol && (high52w !== null || low52w !== null)) {
            rows.push({
                symbol: symbol.toUpperCase(),
                series: series || 'EQ',
                high52w: high52w,
                low52w: low52w,
                high52wDate: high52wDate,
                low52wDate: low52wDate
            });
        } else {
            skippedInvalid++;
            // Log why first invalid row was skipped (for debugging)
            if (rows.length === 0 && skippedInvalid === 1 && i === headerRowIndex + 1) {
                console.warn('⚠️ 52W parser - First row was skipped:', {
                    symbol,
                    hasSymbol: !!symbol,
                    high52w,
                    low52w,
                    hasHigh52w: high52w !== null,
                    hasLow52w: low52w !== null,
                    high52wValue: high52wValue !== undefined ? high52wValue : 'N/A',
                    low52wValue: low52wValue !== undefined ? low52wValue : 'N/A',
                    rowKeys: Object.keys(row)
                });
            }
        }
    }
    
    // Always log 52W parsing results (even if DEBUG is false) to help diagnose issues
    if (rows.length === 0) {
        console.warn(`⚠️ 52W parser: Parsed 0 rows from file`);
        console.warn(`   Headers found (${headers.length}):`, headers.length > 0 ? headers.join(', ') : 'NONE');
        console.warn(`   Header row index: ${headerRowIndex >= 0 ? headerRowIndex + 1 : 'NOT FOUND'}`);
        console.warn(`   Skipped: ${skippedEmpty} empty lines, ${skippedInvalid} invalid rows`);
        console.warn(`   Total lines in file: ${lines.length}`);
        
        // Show first few raw lines for debugging
        if (lines.length > 0) {
            console.warn(`   First 5 lines of file:`);
            lines.slice(0, Math.min(5, lines.length)).forEach((line, idx) => {
                console.warn(`     Line ${idx + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
            });
        }
        
        // Show header row if found
        if (headerRowIndex >= 0 && headerRowIndex < lines.length) {
            console.warn(`   Detected header row (line ${headerRowIndex + 1}):`, lines[headerRowIndex].substring(0, 200));
            
            // Show first data row after header if it exists
            if (headerRowIndex + 1 < lines.length) {
                const firstDataLine = lines[headerRowIndex + 1];
                console.warn(`   First data row after header (line ${headerRowIndex + 2}):`, firstDataLine.substring(0, 200));
            }
        }
        
        if (headers.length > 0 && skippedInvalid > 0) {
            console.warn(`   ⚠️ Field names may not match. Expected: ADJUSTED_52_WEEK_HIGH, 52_WEEK_HIGH_DATE, etc.`);
            console.warn(`   Actual headers (normalized):`, headers.map(h => h.toUpperCase()).join(', '));
        }
    } else {
        console.log(`✅ 52W parser: Parsed ${rows.length} valid rows`);
        console.log(`   Skipped: ${skippedEmpty} empty lines, ${skippedInvalid} invalid rows`);
    }
    
    return { 
        rows, 
        errors, 
        metadata: { 
            rowCount: rows.length, 
            columns: headers,
            skipped: { empty: skippedEmpty, invalid: skippedInvalid }
        } 
    };
}

/**
 * Parse Market Activity CSV (MA*.csv - indices-like format)
 */
function parseMarketActivityCsv(text) {
    // Market Activity files are often in indices format
    return parseAllIndicesCsv(text);
}

/**
 * Parse date from NSE filename (frontend version)
 * Extracts DDMMYYYY sequence and converts to YYYY-MM-DD format
 * 
 * @param {string} fileName - The filename to parse
 * @returns {string|null} - Date in YYYY-MM-DD format, or null if not found
 * @throws {Error} - If date is found but invalid (out of range)
 */
function parseNseDateFromFilename(fileName) {
    if (!fileName || typeof fileName !== 'string') {
        return null;
    }

    // Pattern 1: DDMMYYYY (8 digits) - most common for NSE files
    const ddmmyyyyMatchFile = fileName.match(/(\d{2})(\d{2})(\d{4})/);
    if (ddmmyyyyMatchFile) {
        const [, dd, mm, yyyy] = ddmmyyyyMatchFile;
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

    // Pattern 2: YYYYMMDD (8 digits)
    const yyyymmddMatch = fileName.match(/(\d{4})(\d{2})(\d{2})/);
    if (yyyymmddMatch) {
        const [, year, month, day] = yyyymmddMatch;
        const yearNum = Number(year);
        const monthNum = Number(month);
        const dayNum = Number(day);

        if (yearNum < 2000 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
            throw new Error(
                `Invalid parsed date from filename ${fileName}: ${year}-${month}-${day}. ` +
                `Year must be 2000-2100, month 1-12, day 1-31.`
            );
        }

        return `${year}-${month}-${day}`;
    }

    // Pattern 3: DDMMYY (6 digits at end)
    const ddmmyyMatch = fileName.match(/(\d{2})(\d{2})(\d{2})\.csv$/i);
    if (ddmmyyMatch) {
        const [, day, month, yy] = ddmmyyMatch;
        const year = `20${yy}`;
        const yearNum = Number(year);
        const monthNum = Number(month);
        const dayNum = Number(day);

        if (yearNum < 2000 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
            throw new Error(
                `Invalid parsed date from filename ${fileName}: ${year}-${month}-${day}. ` +
                `Year must be 2000-2100, month 1-12, day 1-31.`
            );
        }

        return `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }

    // Pattern 4: DD-MMM-YYYY
    const ddmmyyyyMatchHyphen = fileName.match(/(\d{2})-([A-Z]{3})-(\d{4})/i);
    if (ddmmyyyyMatchHyphen) {
        const [, day, monthStr, year] = ddmmyyyyMatchHyphen;
        const monthMap = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
            'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
            'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };
        const month = monthMap[monthStr.toUpperCase()] || '01';
        const yearNum = Number(year);
        const monthNum = Number(month);
        const dayNum = Number(day);

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

// Export all parsers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parsePreOpenCsv,
        parseAllIndicesCsv,
        parseBhavcopyCsv,
        parseIndiSnapshotCsv,
        parse52wCsv,
        parseMarketActivityCsv,
        parseNseDateFromFilename,
        cleanNumber,
        cleanHeader,
        normalizeDate,
        detectAndFixNseMultilineHeaderCsv
    };
}

