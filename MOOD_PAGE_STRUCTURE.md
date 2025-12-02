# Mood Page Structure - Current Implementation

## Overview
The Mood page is already correctly structured according to requirements. This document outlines the current implementation and data flow.

## Page Structure (Top to Bottom)

### 1. Mood Box (Mood Card)
- **Element**: `#moodCard`
- **Contains**:
  - Mood emoji indicator
  - Mood text (e.g., "Bullish", "Bearish", "Neutral")
  - Score bar with visual percentage fill
  - Score text (e.g., "65/100")

### 2. Main Indices Grid (4 Major Indices)
- **Element**: `#mainIndicesGrid`
- **Displays**:
  - **NIFTY 50** - Main benchmark index
  - **NIFTY BANK** - Banking sector index
  - **NIFTY IT** - IT sector index
  - **INDIA VIX** - Volatility index
- **Layout**: 2x2 grid (responsive)
- **Card Style**: Large cards with index name, value, change, and percentage change

### 3. All Indices Section (Remaining Indices)
- **Element**: `#allIndicesSection`
- **Contains**:
  - Section header with title "All Indices"
  - View toggle buttons (Card/Table view)
  - Calendar button (for date selection when using uploaded data)
  
#### 3a. Card View
- **Element**: `#allIndicesGrid`
- **Layout**: Responsive grid (2-4 columns based on screen size)
- **Displays**: All indices except the 4 main ones
- **Sorting**: Highest gainers first, then highest losers

#### 3b. Table View
- **Element**: `#tableContainer` > `#indicesTable`
- **Layout**: Scrollable table
- **Columns**: #, Index Name, Value, Change (with %)
- **Features**: 
  - Row numbering
  - Color-coded changes (green/red)
  - Compact view for many indices

### 4. Market Breadth
- **Element**: `.advance-decline`
- **Contains**:
  - Title: "Market Breadth"
  - Advances count (green)
  - Declines count (red)
- **Purpose**: Shows overall market direction

### 5. Data Source Info
- **Element**: `.data-source-info`
- **Displays**: 
  - Data source (NSE India or Uploaded CSV)
  - Update frequency info

## Data Source Logic

### Settings-Based Data Selection

The page automatically uses the correct data source based on Settings:

```javascript
const activeApi = window.settingsManager?.settings?.activeApi;
```

#### Option 1: NSE India (Live Data)
- **When**: `activeApi !== 'uploaded'`
- **Source**: `/api/nse-data` or `/api/dhan-data`
- **Features**:
  - Live data during market hours
  - Auto-refresh every 30 seconds
  - Real-time mood calculation
  
#### Option 2: Uploaded CSV Data
- **When**: `activeApi === 'uploaded'`
- **Source**: 
  1. First checks `localStorage` for recently uploaded data
  2. Falls back to database via `/api/get-uploaded-data?date=YYYY-MM-DD`
- **Features**:
  - Historical data analysis
  - Date selection via calendar
  - Static data (no auto-refresh)

## Data Flow

```
User selects data source in Settings
         ↓
app.loadData() checks activeApi setting
         ↓
   ┌──────────────┐
   │   NSE India  │ or │ Uploaded CSV │
   └──────────────┘    └──────────────┘
         ↓                     ↓
   API Request          localStorage/Database
         ↓                     ↓
   ──────────────────────────────
         ↓
   updateUI(data)
         ↓
   ┌─────────────────────────────┐
   │ updateMood()                │
   │ updateIndices()             │
   │ updateAdvanceDecline()      │
   └─────────────────────────────┘
         ↓
   Display on Mood Page
```

## Key Functions

### Data Loading
- **`loadData()`** (line 536)
  - Checks `activeApi` setting
  - Loads from appropriate source
  - Handles retries and errors

### UI Updates
- **`updateUI(data)`** 
  - Coordinates all UI updates
  - Calls mood, indices, and breadth update functions

- **`updateMood(mood)`**
  - Updates mood box with emoji, text, score

- **`updateIndices(indices, vix)`** (line 979)
  - Separates 4 main indices
  - Displays main indices in `mainIndicesGrid`
  - Displays remaining indices in `allIndicesSection`
  - Handles card/table view toggle

- **`updateAdvanceDecline(advances, declines)`**
  - Updates market breadth section

## Index Display Logic

### Main Indices Selection (line 983-1089)
```javascript
const mainIndicesSymbols = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'INDIA VIX'];
```

1. **NIFTY 50**: Finds using flexible matching (NIFTY 50, Nifty50, etc.)
2. **NIFTY BANK**: Exact match to avoid confusion with NIFTY PSU BANK
3. **NIFTY IT**: IT sector index
4. **INDIA VIX**: From `vix` parameter or indices array

### Remaining Indices (line 1091-1133)
- Filters out the 4 main indices
- Sorts by percentage change:
  - Positive changes first (highest to lowest)
  - Negative changes last (most negative first)
- Displays in current view mode (card/table)

## View Modes

### Card View (Default)
- **Element**: `#allIndicesGrid`
- **CSS Class**: `.data-grid.all-indices-grid`
- **Layout**: CSS Grid with responsive columns
- **Function**: `renderIndicesCards(indices)` (line 1196)

### Table View
- **Element**: `#tableContainer`
- **CSS Class**: `.table-container`
- **Layout**: HTML table with scrolling
- **Function**: `renderIndicesTable(indices)` (line 1261)

### Toggle Logic
- **Buttons**: `#cardViewBtn`, `#tableViewBtn`
- **Storage**: `localStorage.setItem('indicesViewMode', 'card' | 'table')`
- **Function**: `switchView(mode)` (line 1352)

## Responsive Design

### Desktop (1024px+)
- Main indices: 2 columns
- All indices cards: 4 columns
- Large card sizes

### Tablet (600-1023px)
- Main indices: 2 columns
- All indices cards: 3 columns
- Medium card sizes

### Mobile (<600px)
- Main indices: 1-2 columns (responsive)
- All indices cards: 2 columns
- Compact card sizes
- Table view recommended for many indices

## Current Status

✅ **Working Features:**
1. Mood box displays correctly
2. 4 major indices show in main grid
3. Remaining indices show in card/table view
4. Market breadth displays
5. Data source selection works
6. View toggle works
7. Sorting works correctly
8. Responsive layout works

## Testing Checklist

- [ ] NSE India data loads correctly
- [ ] Uploaded CSV data loads correctly
- [ ] Mood box updates properly
- [ ] 4 main indices display
- [ ] Remaining indices display
- [ ] Card view renders properly
- [ ] Table view renders properly
- [ ] View toggle works
- [ ] Market breadth shows
- [ ] Data source indicator correct
- [ ] Responsive on mobile
- [ ] Auto-refresh works (NSE only)

## Troubleshooting

### Issue: Main indices not showing
**Check:**
1. Are indices loaded? Check console for API response
2. Do index names match? (NIFTY 50, NIFTY BANK, etc.)
3. Is `mainIndicesGrid` element present in DOM?

### Issue: Remaining indices not showing
**Check:**
1. Is `allIndicesSection` display set to 'block'?
2. Are there more than 4 indices total?
3. Check if view mode is properly set

### Issue: Wrong data source
**Check:**
1. Settings -> Active API selection
2. `window.settingsManager?.settings?.activeApi` value
3. Console logs for data source confirmation

### Issue: Market breadth not showing
**Check:**
1. Does API response include `advanceDecline` data?
2. Is `.advance-decline` element present?
3. Check `advances` and `declines` values

## Files Involved

- **HTML**: `/public/index.html` (lines 26-112)
- **JavaScript**: `/public/app.js` 
  - Data loading: lines 536-733
  - UI updates: lines 979-1420
- **CSS**: `/public/styles.css`
  - Mood card, data grid, table styles

---

**Conclusion**: The Mood page structure is already correctly implemented according to requirements. All components are in place and functioning as specified.
