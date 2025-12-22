/**
 * NSE CSV Normalization Layer
 * Robust parsers for various NSE CSV formats with multiline header support
 */

// Debug flag - set to true to enable verbose logging
const DEBUG = false;

/**
 * Helper: Clean number value (remove commas, trim, return Number or null)
 */
function cleanNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
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
 */
function normalizeDate(input) {
    if (!input) return null;
    
    // If already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return input;
    }
    
    // Try parsing as Date
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Try DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyy = input.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/);
    if (ddmmyyyy) {
        return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }
    
    // Try YYYYMMDD
    const yyyymmdd = input.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (yyyymmdd) {
        return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
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
 */
function parseBhavcopyCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
        return { rows: [], errors: ['CSV file is empty or invalid'] };
    }
    
    // Find header row
    let headerRowIndex = -1;
    let headers = [];
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const lineUpper = lines[i].toUpperCase();
        if (lineUpper.includes('SYMBOL') && (lineUpper.includes('SERIES') || lineUpper.includes('OPEN'))) {
            headers = parseCSVLine(lines[i]).map(cleanHeader);
            headerRowIndex = i;
            break;
        }
    }
    
    // Fallback to standard bhavcopy header
    if (headers.length === 0) {
        headers = ['SYMBOL', 'SERIES', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'LAST', 'PREVCLOSE', 'TOTTRDQTY', 'TOTTRDVAL', 'TIMESTAMP'];
        headerRowIndex = 0;
    }
    
    const rows = [];
    const errors = [];
    let skippedNoSymbol = 0;
    let skippedNotEq = 0;
    let skippedInvalidClose = 0;
    
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
        const series = (row.SERIES || '').trim().toUpperCase();
        
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
        
        // Extract prices
        const close = cleanNumber(row.CLOSE || row['CLOSE_PRIC'] || row['CLOSE_PRICE'] || row['LAST_PRICE'] || row.LAST);
        const open = cleanNumber(row.OPEN || row['OPEN_PRICE']);
        const high = cleanNumber(row.HIGH || row['HIGH_PRICE']);
        const low = cleanNumber(row.LOW || row['LOW_PRICE']);
        const prevClose = cleanNumber(row.PREVCLOSE || row['PREV_CLOSE'] || row['PREVCLOSE_PRICE']);
        const volume = cleanNumber(row.TOTTRDQTY || row['TTL_TRD_QN'] || row.VOLUME);
        const delivery = cleanNumber(row.DELIV_QTY || row.DELIVERY);
        const deliveryPercent = cleanNumber(row.DELIV_PER || row['DELIVERY_PER']);
        
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
 */
function parse52wCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
        return { rows: [], errors: ['CSV file is empty or invalid'] };
    }
    
    // Find header row (skip disclaimer lines)
    let headerRowIndex = -1;
    let headers = [];
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const lineUpper = lines[i].toUpperCase();
        // Skip disclaimer lines
        if (lineUpper.includes('DISCLAIMER') || lineUpper.includes('NOTE') || lineUpper.includes('COPYRIGHT')) {
            continue;
        }
        if (lineUpper.includes('SYMBOL') && (lineUpper.includes('52W') || lineUpper.includes('HIGH') || lineUpper.includes('LOW'))) {
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
        
        const symbol = (row.SYMBOL || '').trim();
        
        // Skip header-like and footer rows
        if (!symbol || symbol === 'SYMBOL' || symbol.includes('DISCLAIMER')) continue;
        
        const high52w = cleanNumber(row['52W HIGH'] || row['52W_HIGH'] || row['HIGH_52W'] || row['HIGH']);
        const low52w = cleanNumber(row['52W LOW'] || row['52W_LOW'] || row['LOW_52W'] || row['LOW']);
        const high52wDate = normalizeDate(row['52W HIGH DATE'] || row['HIGH_DATE'] || row['HIGH DATE']);
        const low52wDate = normalizeDate(row['52W LOW DATE'] || row['LOW_DATE'] || row['LOW DATE']);
        
        if (symbol && (high52w !== null || low52w !== null)) {
            rows.push({
                symbol: symbol.toUpperCase(),
                high52w: high52w,
                low52w: low52w,
                high52wDate: high52wDate,
                low52wDate: low52wDate
            });
        }
    }
    
    if (DEBUG) console.log(`Parsed ${rows.length} 52W rows`);
    
    return { rows, errors, metadata: { rowCount: rows.length, columns: headers } };
}

/**
 * Parse Market Activity CSV (MA*.csv - indices-like format)
 */
function parseMarketActivityCsv(text) {
    // Market Activity files are often in indices format
    return parseAllIndicesCsv(text);
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
        cleanNumber,
        cleanHeader,
        normalizeDate,
        detectAndFixNseMultilineHeaderCsv
    };
}

