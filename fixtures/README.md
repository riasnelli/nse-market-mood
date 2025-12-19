# NSE CSV Test Fixtures

This directory contains sample CSV snippets from various NSE file formats for testing parsers.

## Files

- `MW-Pre-Open-Market-sample.csv` - Sample pre-open market CSV with multiline header
- `MW-All-Indices-sample.csv` - Sample all indices CSV with multiline header  
- `CM_52_wk_High_low-sample.csv` - Sample 52 week high/low CSV with disclaimer lines
- `sec_bhavdata-sample.csv` - Sample bhavcopy CSV
- `MA-sample.csv` - Sample market activity CSV (indices format)

## Usage

These fixtures are used to test the parsers in `public/utils/nseParsers.js` to ensure they can handle:
- Multiline headers
- UTF-8 BOM
- Various column name variations
- Footer/disclaimer rows
- Missing or malformed data

## Note

These are sample snippets only. Full files may contain more rows and variations.

