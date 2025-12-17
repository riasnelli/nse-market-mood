# NSE Market Mood - Complete Status Report

**Last Updated:** December 2024  
**Version:** 1.0.0  
**Deployment:** Vercel (Hobby Plan - 12 Serverless Functions)

---

## 📋 Table of Contents

1. [Application Overview](#application-overview)
2. [Features & Functionality](#features--functionality)
3. [Data Sources](#data-sources)
4. [MongoDB Collections](#mongodb-collections)
5. [Update Intervals & Refresh Rates](#update-intervals--refresh-rates)
6. [Real vs Dummy Data](#real-vs-dummy-data)
7. [API Endpoints](#api-endpoints)
8. [Areas Still in Development](#areas-still-in-development)
9. [Known Limitations](#known-limitations)
10. [Technical Stack](#technical-stack)

---

## 🎯 Application Overview

**NSE Market Mood** is a Progressive Web App (PWA) that provides real-time market sentiment analysis for the National Stock Exchange (NSE) of India. The app displays market mood indicators, index data, market breadth, and allows users to upload historical data for analysis.

**Platform:** Vercel (Serverless Functions)  
**Database:** MongoDB Atlas  
**Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3  
**Backend:** Node.js (Vercel Serverless Functions)

---

## ✨ Features & Functionality

### ✅ **Implemented Features**

#### 1. **Real-Time Market Data Display**
- **NIFTY 50, BANK NIFTY, VIX** - Main indices in prominent 2x2 grid
- **All Indices** - Complete list of all NSE indices (50+ indices)
- **Market Breadth** - Advances vs Declines count
- **Last Updated Timestamp** - Shows when data was last fetched

#### 2. **Market Mood Calculation**
- **Algorithm:** 
  - NIFTY 50 Performance (40% weight)
  - All Indices Performance (30% weight)
  - Market Breadth (30% weight)
- **Mood Levels:**
  - 😊 Very Bullish (70-100)
  - 🙂 Bullish (60-69)
  - 😐 Neutral (40-59)
  - 😕 Bearish (30-39)
  - 😟 Very Bearish (0-29)
- **Visual Feedback:** Color-coded gradients, emoji, animated score bar

#### 3. **Data Upload System**
- **Supported File Types:**
  - CSV files (comma-separated)
  - Previously supported DAT files (now deprecated)
- **Data Types Supported:**
  1. **Indices** - NSE index data
  2. **Bhavcopy** - End-of-day stock data (EQ series only)
  3. **Pre-market** - Pre-open market data
  4. **Market Activity (EOD)** - Market activity end-of-day data
  5. **52W High/Low** - 52-week high/low data
- **Features:**
  - Date-based organization
  - Duplicate detection
  - Validation and error handling
  - Export functionality
  - Delete individual files
  - Bulk delete (select all)

#### 4. **Historical Data Viewing**
- **Calendar Modal** - Visual date picker
- **Color-coded Dates** - Border colors indicate mood for each date
- **Date Selection** - Click date to load historical data
- **Static Data Mode** - Auto-refresh disabled for historical data

#### 5. **View Modes**
- **Card View** - 2-column grid layout (default)
- **Table View** - Full-width sortable table
- **Toggle** - Switch between views
- **Preference Saved** - View preference stored in localStorage

#### 6. **Signal Generation**
- **Strategy:** Momentum Gap
- **Data Sources:**
  - Yesterday's bhavcopy (EOD data)
  - Yesterday's indices
  - Today's premarket data
- **Output:** Stock signals with gap-up analysis
- **Collections:** `signals`, `signal_runs`

#### 7. **Automated CSV Download**
- **Source:** NSE India Archives (https://archives.nseindia.com)
- **Report Types:**
  - Bhavcopy (Full)
  - Market Activity
  - 52W High/Low
- **Features:**
  - Automatic date calculation (today/previous trading day)
  - Progress tracking per file
  - Overall progress bar
  - Google Sheets integration (optional)
  - Error handling with fallback dates

#### 8. **Google Sheets Integration**
- **Optional Feature** - Upload downloaded CSVs to Google Sheets
- **Configuration:**
  - Google Sheet ID
  - Sheet Name
  - Google API Key
- **Batch Upload** - Processes data in batches (1000 rows/request)

#### 9. **Data Management**
- **Flush Uploaded Data** - Bulk delete all CSV-uploaded data
- **Export Selected** - Download selected files as CSV
- **Delete Individual** - Remove specific uploaded files
- **Select All** - Checkbox to select/deselect all rows

#### 10. **PWA Features**
- **Installable** - Add to Home Screen
- **Offline Support** - Service Worker caching
- **App-like Experience** - Standalone mode, full-screen
- **iOS Dynamic Island Support** - Safe area insets
- **Theme Color** - Dynamic based on market mood

#### 11. **Settings Management**
- **API Selection:**
  - NSE India (default, no config)
  - Dhan API (requires credentials)
  - Uploaded Data (date selection)
- **Dhan API Configuration:**
  - Client ID
  - Access Token
  - API Key (optional, v2.4+)
  - API Secret (optional, v2.4+)
  - Custom Endpoint (optional)
- **Test Connection** - Verify Dhan API before saving

#### 12. **Auto-Refresh System**
- **Polling Interval:** 30 seconds during market hours
- **Market Status Detection:**
  - Time-based (9:15 AM - 3:30 PM IST)
  - API-based verification
  - Combined check for accuracy
- **Auto Start/Stop** - Automatically starts/stops based on market status
- **Manual Refresh** - Refresh button in footer menu

---

## 📊 Data Sources

### **1. NSE India API** (Primary - Real Data)
- **Status:** ✅ Active (Default)
- **Type:** Real-time live data
- **Source:** NSE India Official API
- **Endpoint:** `https://www.nseindia.com/api/equity-stockIndices`
- **Authentication:** None required
- **Rate Limiting:** Subject to NSE rate limits
- **Update Interval:** 30 seconds during market hours
- **Data Provided:**
  - All NSE indices (50+ indices)
  - VIX (Volatility Index)
  - Market breadth (advances/declines)
  - Real-time prices and changes
- **Auto-Storage:** Yes - Automatically saves to `daily_indices` collection
- **Duplicate Prevention:** Checks for existing data for today's date

### **2. Dhan API** (Optional - Real Data)
- **Status:** ⚙️ Configurable (Requires Setup)
- **Type:** Real-time live data
- **Source:** Dhan API (https://api.dhan.co)
- **Endpoint:** Multiple endpoints (instruments, quotes, etc.)
- **Authentication:** Required
  - Access Token (required)
  - Client ID (optional)
  - API Key (optional, v2.4+)
  - API Secret (optional, v2.4+)
- **Update Interval:** 30 seconds during market hours
- **Data Provided:**
  - Stock/equity data
  - Backtesting support
  - **Note:** Indices not directly supported (requires securityIds)
- **Limitation:** Primarily for stocks/equities, not indices
- **Error Handling:** Shows error message (no mock data fallback)

### **3. Uploaded CSV Data** (User-Provided)
- **Status:** ✅ Active
- **Type:** Static historical data
- **Source:** User-uploaded CSV files
- **Storage:** MongoDB collections
- **Update Interval:** None (static data)
- **Data Types:**
  - Indices (`uploadedIndices`)
  - Bhavcopy (`uploadedBhav`)
  - Pre-market (`uploadedPreMarket`)
  - Market Activity (`uploadedMarketActivity`)
  - 52W High/Low (`uploadedWeek52`)
- **Features:**
  - Date-based organization
  - Export functionality
  - Delete capability
  - Historical viewing

### **4. NSE Archives** (Automated Downloads)
- **Status:** ✅ Active
- **Type:** Real data from NSE archives
- **Source:** https://archives.nseindia.com
- **Update Interval:** On-demand (manual trigger)
- **Report Types:**
  - Bhavcopy (Full)
  - Market Activity
  - 52W High/Low
- **Features:**
  - Automatic date calculation
  - Fallback to previous trading day
  - Progress tracking
  - Google Sheets upload (optional)

---

## 🗄️ MongoDB Collections

### **User-Uploaded Data Collections**

1. **`uploadedIndices`**
   - Stores user-uploaded indices CSV data
   - Fields: `fileName`, `date`, `indices[]`, `mood`, `vix`, `advanceDecline`, `type`, `uploadedAt`

2. **`uploadedBhav`**
   - Stores user-uploaded bhavcopy CSV data
   - Fields: `fileName`, `date`, `indices[]` (EQ stocks only), `indicesCount`, `type`, `uploadedAt`

3. **`uploadedPreMarket`**
   - Stores user-uploaded premarket CSV data
   - Fields: `fileName`, `date`, `indices[]`, `indicesCount`, `header`, `type`, `uploadedAt`

4. **`uploadedMarketActivity`**
   - Stores user-uploaded market activity (EOD) data
   - Fields: `fileName`, `date`, `indices[]`, `indicesCount`, `type`, `uploadedAt`

5. **`uploadedWeek52`**
   - Stores user-uploaded 52W High/Low data
   - Fields: `fileName`, `date`, `indices[]`, `indicesCount`, `type`, `uploadedAt`

### **Auto-Stored Data Collections**

6. **`daily_indices`**
   - Automatically stores data fetched from NSE India API
   - Fields: `date` (IST), `indices[]`, `vix`, `timestamp`
   - **Duplicate Prevention:** Checks for existing data for today's date
   - **Update:** Daily (when NSE API is called)

7. **`daily_bhavcopy`**
   - Stores bhavcopy data (from uploads or automated processes)
   - Fields: `date`, `indices[]`, `indicesCount`, `type`

8. **`premarket_data`**
   - Stores premarket data (from uploads or automated processes)
   - Fields: `date`, `indices[]`, `indicesCount`, `header`, `type`

### **Signal Collections**

9. **`signals`**
   - Stores generated trading signals
   - Fields: `date`, `strategy`, `signals[]`, `generatedAt`, `runId`

10. **`signal_runs`**
    - Tracks signal generation runs
    - Fields: `runId`, `date`, `strategy`, `signalCount`, `generatedAt`, `status`

### **Collections NOT Affected by Flush**
- `daily_indices` - Auto-stored NSE data (preserved)
- `daily_bhavcopy` - Auto-stored bhavcopy (preserved)
- `premarket_data` - Auto-stored premarket (preserved)
- `signals` - Generated signals (preserved)
- `signal_runs` - Signal run history (preserved)

---

## ⏱️ Update Intervals & Refresh Rates

### **Real-Time Data (Live)**

| Data Source | Update Interval | Market Hours | Status |
|------------|----------------|--------------|--------|
| **NSE India API** | 30 seconds | 9:15 AM - 3:30 PM IST | ✅ Active |
| **Dhan API** | 30 seconds | 9:15 AM - 3:30 PM IST | ⚙️ Optional |
| **Auto-Storage (daily_indices)** | Daily | When API is called | ✅ Active |

### **Static Data (Historical)**

| Data Type | Update Interval | Notes |
|-----------|----------------|------|
| **Uploaded CSV Data** | None (static) | User-uploaded, no auto-updates |
| **Historical Viewing** | None (static) | Loads once when date selected |
| **Signal Generation** | On-demand | Generated when requested |

### **Automated Processes**

| Process | Trigger | Frequency |
|---------|---------|-----------|
| **CSV Download from NSE** | Manual (button click) | On-demand |
| **Google Sheets Upload** | Manual (with CSV download) | On-demand |
| **Signal Generation** | Manual or scheduled | On-demand |

---

## 🎭 Real vs Dummy Data

### **Real Data Sources**

✅ **NSE India API**
- **Type:** Real-time live market data
- **Source:** Official NSE India API
- **Status:** Always real (no dummy data)
- **Fallback:** Mock data shown only if API fails (for NSE only)

✅ **Dhan API**
- **Type:** Real-time live market data
- **Source:** Dhan API (requires credentials)
- **Status:** Always real (no dummy data)
- **Fallback:** Error message shown (no mock data)

✅ **Uploaded CSV Data**
- **Type:** User-provided historical data
- **Source:** User uploads
- **Status:** Real data from user files
- **Validation:** File format and content validated

✅ **NSE Archives Downloads**
- **Type:** Real historical data from NSE
- **Source:** NSE India archives website
- **Status:** Real data from official source

### **Dummy/Mock Data**

⚠️ **Mock Data Fallback (NSE API Only)**
- **When Used:** Only when NSE API fails and no data is available
- **Purpose:** Prevent blank screen, show sample data
- **Not Used For:** Dhan API errors (shows error instead)
- **Location:** `public/app.js` - `useMockData()` function

### **Test Data**

🧪 **Test Endpoints (Removed)**
- Previously had test endpoints (`test-dhan.js`, `test-generate-signals.js`, `manifest.js`)
- **Status:** Removed to comply with Vercel Hobby plan (12 function limit)
- **Reason:** Exceeded serverless function limit

---

## 🔌 API Endpoints

### **Data Fetching APIs**

1. **`/api/nse-data`** (GET)
   - Fetches real-time data from NSE India
   - Returns: indices, VIX, market breadth, market status
   - Auto-stores to `daily_indices` collection

2. **`/api/dhan-data`** (GET/POST)
   - Fetches data from Dhan API
   - Requires: Access Token (and optionally Client ID, API Key, API Secret)
   - Returns: Stock/equity data

### **Upload & Data Management APIs**

3. **`/api/save-uploaded-data`** (POST)
   - Saves uploaded CSV data to MongoDB
   - Supports: indices, bhav, premarket, marketactivity, 52w
   - Returns: Success status, document ID

4. **`/api/get-uploaded-data`** (GET)
   - Retrieves uploaded data by date or ID
   - Query params: `date`, `id`, `type`, `full`
   - Returns: Uploaded data array

5. **`/api/get-uploaded-dates`** (GET)
   - Lists all dates with uploaded data
   - Returns: Array of dates with counts

6. **`/api/flush-uploaded-data`** (POST)
   - Deletes all data from uploaded collections
   - Affected: `uploadedIndices`, `uploadedBhav`, `uploadedPreMarket`, `uploadedMarketActivity`, `uploadedWeek52`
   - **Does NOT affect:** `daily_indices`, `daily_bhavcopy`, `premarket_data`, `signals`, `signal_runs`

### **Signal Generation APIs**

7. **`/api/generate-signals`** (POST)
   - Generates trading signals using momentum gap strategy
   - Requires: date, strategy
   - Returns: Generated signals array

8. **`/api/get-signals`** (GET)
   - Retrieves generated signals
   - Query params: `date`, `strategy`
   - Returns: Signals array

9. **`/api/get-latest-signal-date`** (GET)
   - Gets the latest date for which signals were generated
   - Returns: Latest date string

### **Utility APIs**

10. **`/api/check-date-data`** (GET)
    - Checks data availability for a specific date
    - Query params: `date`
    - Returns: Data availability status

11. **`/api/index-history`** (GET)
    - Retrieves historical index data
    - Query params: `symbol`, `date`
    - Returns: Historical data array

12. **`/api/download-nse-csvs`** (POST)
    - Downloads CSVs from NSE India archives
    - Body: `reportTypes[]`, `googleSheetId`, `googleSheetName`, `googleApiKey`
    - Returns: Download results with progress info

---

## 🚧 Areas Still in Development

### **High Priority**

1. **Enhanced Bhavcopy CSV Parsing**
   - **Status:** ⚠️ In Progress
   - **Issue:** Some CSV formats not detecting SERIES column correctly
   - **Current:** Enhanced debugging added, needs format-specific handling
   - **Next Steps:** Add format detection and flexible column mapping

2. **Error Handling Improvements**
   - **Status:** 🔄 Ongoing
   - **Current:** Basic error handling with fallbacks
   - **Needed:** More granular error messages, retry strategies

3. **Data Validation**
   - **Status:** 🔄 Partial
   - **Current:** Basic file format validation
   - **Needed:** Content validation, data integrity checks

### **Medium Priority**

4. **Authentication & User Accounts**
   - **Status:** ❌ Not Started
   - **Planned:** User accounts, data persistence per user, multi-user support
   - **Priority:** Medium

5. **Advanced Analytics & Charts**
   - **Status:** ❌ Not Started
   - **Planned:** Historical charts, trend analysis, predictive indicators
   - **Dependencies:** Chart.js already included in dependencies
   - **Priority:** Medium

6. **Push Notifications**
   - **Status:** ❌ Not Started
   - **Planned:** Market alerts, price alerts, mood change notifications
   - **Priority:** Medium

7. **Performance Optimizations**
   - **Status:** 🔄 Partial
   - **Current:** Basic caching, service worker
   - **Needed:** Virtual scrolling for large datasets, lazy loading, image optimization
   - **Priority:** Medium

### **Low Priority / Future Enhancements**

8. **Social Features**
   - **Status:** ❌ Not Started
   - **Planned:** Share mood, compare dates, community insights
   - **Priority:** Low

9. **Accessibility Improvements**
   - **Status:** 🔄 Partial
   - **Current:** Basic responsive design
   - **Needed:** ARIA labels, keyboard navigation, screen reader support
   - **Priority:** Low

10. **Multi-Strategy Signal Generation**
    - **Status:** 🔄 Partial
    - **Current:** Only momentum gap strategy
    - **Planned:** Additional trading strategies
    - **Priority:** Low

11. **Real-Time WebSocket Support**
    - **Status:** ❌ Not Started
    - **Planned:** WebSocket connections for real-time updates
    - **Priority:** Low

12. **Mobile App (Native)**
    - **Status:** ❌ Not Started
    - **Planned:** Native iOS/Android apps
    - **Priority:** Low (PWA works well)

---

## ⚠️ Known Limitations

### **Platform Limitations**

1. **Vercel Hobby Plan**
   - **Limit:** 12 Serverless Functions maximum
   - **Current:** 12 functions (at limit)
   - **Impact:** Cannot add new API endpoints without removing existing ones
   - **Solution:** Upgrade to Pro plan or consolidate functions

2. **MongoDB Connection Pooling**
   - **Limit:** Serverless function connection limits
   - **Current:** Optimized with connection caching
   - **Impact:** Potential connection delays on cold starts

### **Data Source Limitations**

3. **NSE API Rate Limiting**
   - **Limit:** Subject to NSE rate limits
   - **Impact:** May fail during high traffic
   - **Mitigation:** 30-second polling, retry mechanism

4. **Dhan API Indices Support**
   - **Limit:** Indices not directly supported
   - **Impact:** Requires securityIds for indices
   - **Workaround:** Use NSE API for indices, Dhan for stocks

5. **Bhavcopy CSV Format Variations**
   - **Limit:** Different CSV formats may not parse correctly
   - **Impact:** Some files may show "0 EQ stocks processed"
   - **Mitigation:** Enhanced debugging, format detection in progress

### **Feature Limitations**

6. **Historical Data Range**
   - **Limit:** Only dates with uploaded data available
   - **Impact:** Cannot view dates without uploaded data
   - **Future:** Auto-fetch historical data from NSE archives

7. **Signal Generation Dependencies**
   - **Limit:** Requires yesterday's bhavcopy + today's premarket
   - **Impact:** Signals only available when both data types exist
   - **Mitigation:** Clear error messages when data missing

8. **Google Sheets Integration**
   - **Limit:** Requires Google API Key
   - **Impact:** Optional feature, not required for core functionality
   - **Future:** Support for other cloud storage options

---

## 🛠️ Technical Stack

### **Frontend**
- **Language:** JavaScript (ES6+)
- **Framework:** None (Vanilla JS)
- **UI:** HTML5, CSS3
- **PWA:** Service Worker, Web App Manifest
- **Storage:** localStorage (settings, preferences)

### **Backend**
- **Platform:** Vercel Serverless Functions
- **Language:** Node.js
- **Runtime:** Node.js 18.x
- **HTTP Client:** node-fetch
- **Database:** MongoDB Atlas

### **Dependencies**
```json
{
  "@vercel/functions": "^3.3.3",
  "chart.js": "^4.5.1",
  "mongodb": "^7.0.0",
  "node-fetch": "^2.6.7"
}
```

### **Dev Dependencies**
```json
{
  "sharp": "^0.34.5"
}
```

### **Deployment**
- **Platform:** Vercel
- **Plan:** Hobby (Free)
- **Functions:** 12/12 (at limit)
- **Database:** MongoDB Atlas (external)
- **CDN:** Vercel Edge Network

---

## 📝 Summary

### **What's Working**
✅ Real-time NSE data fetching and display  
✅ Market mood calculation and visualization  
✅ CSV upload for 5 data types  
✅ Historical data viewing with calendar  
✅ Signal generation (momentum gap strategy)  
✅ Automated CSV downloads from NSE  
✅ Google Sheets integration  
✅ PWA features (installable, offline)  
✅ Multiple API support (NSE, Dhan)  
✅ Auto-storage of NSE data to MongoDB  

### **What Needs Work**
⚠️ Bhavcopy CSV format variations (some files not parsing)  
⚠️ Error handling improvements  
⚠️ Data validation enhancements  

### **What's Planned**
🔮 User authentication  
🔮 Advanced analytics and charts  
🔮 Push notifications  
🔮 Performance optimizations  
🔮 Additional trading strategies  

### **Current Status**
🟢 **Production Ready** - Core features functional  
🟡 **Active Development** - Ongoing improvements  
🔵 **Future Enhancements** - Planned features  

---

**Document Version:** 1.0  
**Last Updated:** December 2024  
**Maintained By:** Development Team
