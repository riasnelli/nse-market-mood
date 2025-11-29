# NSE Market Mood - Complete Application Documentation

## Table of Contents
1. [Application Overview](#application-overview)
2. [UI Structure & Pages](#ui-structure--pages)
3. [Main Dashboard Components](#main-dashboard-components)
4. [Modals & Popups](#modals--popups)
5. [Navigation & Footer Menu](#navigation--footer-menu)
6. [Functionalities & Features](#functionalities--features)
7. [Data Flow & API Integration](#data-flow--api-integration)
8. [User Interactions & UX](#user-interactions--ux)
9. [Responsive Design & PWA Features](#responsive-design--pwa-features)
10. [Technical Implementation](#technical-implementation)

---

## Application Overview

**NSE Market Mood** is a Progressive Web App (PWA) that provides real-time market sentiment analysis for the National Stock Exchange (NSE) of India. The app displays market mood indicators, index data, market breadth, and allows users to upload historical data for analysis.

### Key Characteristics:
- **Type**: Single Page Application (SPA) / Progressive Web App
- **Primary Purpose**: Real-time NSE market sentiment visualization
- **Target Platform**: Mobile-first, optimized for iOS and Android
- **Data Sources**: NSE India API, Dhan API, User-uploaded CSV/DAT files
- **Update Frequency**: Auto-refresh every 30 seconds during market hours

---

## UI Structure & Pages

### Main Page: Dashboard (`index.html`)

The application consists of a single main page with multiple sections that dynamically show/hide based on user interactions and data availability.

#### Page Layout Structure:
```
┌─────────────────────────────────────┐
│         HEADER SECTION              │
│  - Logo + App Title                 │
│  - Last Updated Timestamp           │
├─────────────────────────────────────┤
│         MOOD CARD SECTION           │
│  - Market Mood Emoji & Text         │
│  - Mood Score Bar & Percentage      │
├─────────────────────────────────────┤
│      MAIN INDICES GRID (2x2)        │
│  - NIFTY 50                         │
│  - BANK NIFTY                       │
│  - VIX                              │
│  - (Additional index)               │
├─────────────────────────────────────┤
│      ALL INDICES SECTION            │
│  - Section Header with Controls     │
│  - Card View / Table View Toggle     │
│  - Calendar Date Picker             │
│  - Grid of All Indices (2 columns) │
│  OR                                 │
│  - Table View of All Indices        │
├─────────────────────────────────────┤
│      MARKET BREADTH SECTION         │
│  - Advances Count                   │
│  - Declines Count                   │
├─────────────────────────────────────┤
│      DATA SOURCE INFO               │
│  - Source Name                      │
│  - Update Frequency Info            │
├─────────────────────────────────────┤
│      FLOATING FOOTER MENU          │
│  - Refresh | Settings | Signals     │
│  - Upload | Logout                  │
└─────────────────────────────────────┘
```

---

## Main Dashboard Components

### 1. Header Section
**Location**: Top of page
**Elements**:
- **App Logo**: SVG icon (32x32px, white filter applied)
- **App Title**: "NSE Market Mood" (white text, 1.8rem font)
- **Last Updated**: Dynamic timestamp showing last data fetch time
  - Format: "Last updated: [timestamp]"
  - Updates automatically with each data refresh

**Functionality**:
- Displays branding and app identity
- Provides real-time update status
- Fixed position, always visible

---

### 2. Mood Card Section
**Location**: Below header, prominent position
**ID**: `moodCard`
**Components**:

#### 2.1 Mood Indicator
- **Emoji Display** (`moodEmoji`): Large emoji (4rem) representing market sentiment
  - 😊 Very Bullish (70-100)
  - 🙂 Bullish (60-69)
  - 😐 Neutral (40-59)
  - 😕 Bearish (30-39)
  - 😟 Very Bearish (0-29)
- **Mood Text** (`moodText`): Textual description of mood
  - Examples: "Very Bullish", "Bullish", "Neutral", "Bearish", "Very Bearish"

#### 2.2 Mood Score
- **Score Bar** (`scoreBar`): Horizontal progress bar with gradient
  - Colors: Red → Orange → Green (left to right)
  - Width: 100% container
  - Height: 12px
  - Border radius: 6px
- **Score Fill** (`scoreFill`): Animated fill showing current mood score
  - Width: Dynamically calculated (0-100%)
  - Smooth transition: 0.5s ease
- **Score Text** (`scoreText`): Numerical score display
  - Format: "XX/100"
  - Color: #666 (gray)

**Background Colors** (Dynamic based on mood):
- Very Bullish: Green gradient (#10b981 → #059669)
- Bullish: Light green gradient
- Neutral: Orange gradient (#f97316)
- Bearish: Light red gradient
- Very Bearish: Red gradient (#ef4444 → #dc2626)

**Functionality**:
- Calculates mood score from NIFTY 50 performance, all indices performance, and market breadth
- Updates automatically with each data refresh
- Visual feedback through color-coded gradients

---

### 3. Main Indices Grid
**Location**: Below mood card
**ID**: `mainIndicesGrid`
**Layout**: 2-column grid (responsive)
**Display**: Always visible

**Indices Displayed**:
1. **NIFTY 50** (Primary index)
2. **BANK NIFTY** (Banking sector)
3. **VIX** (Volatility index)
4. **Additional Index** (Dynamic, based on data availability)

**Card Structure** (Each index):
- **Index Name** (h3): Uppercase, 0.8rem font, gray color
- **Value** (data-value): Large number, 1.3rem font, black color
- **Change** (data-change): Percentage change with color coding
  - Green: Positive change
  - Red: Negative change
  - Format: "+X.XX%" or "-X.XX%"

**Styling**:
- White background
- Rounded corners (20px border-radius)
- Shadow: 0 10px 30px rgba(0,0,0,0.2)
- Centered text alignment
- Oval-shaped cards

---

### 4. All Indices Section
**Location**: Below main indices grid
**ID**: `allIndicesSection`
**Visibility**: Hidden by default, shown when "Signals" button clicked or data available

#### 4.1 Section Header
**Components**:
- **Title**: "All Indices" (white text, 1.2rem)
- **Icon Group** (right side):
  - **Calendar Icon Button** (`calendarTriggerBtn`): 
    - Hidden by default
    - Shown when uploaded data is available
    - Opens calendar modal for date selection
    - White icon with hover effect
  - **View Toggle Icons**:
    - **Card View Button** (`cardViewBtn`): Grid icon, active by default
    - **Table View Button** (`tableViewBtn`): Table icon
    - Toggle between card and table views
    - Active state: White icon, inactive: Semi-transparent
    - Hover background effect

#### 4.2 Card View
**ID**: `allIndicesGrid`
**Layout**: 2-column grid
**Display**: Default view
**Cards**: Same structure as main indices cards
- All NSE indices displayed in grid format
- Responsive: 2 columns on mobile, maintains on desktop
- Gap: 15px between cards

**Functionality**:
- Displays all available indices from API or uploaded data
- Sorted by performance or alphabetically
- Click to view details (if implemented)

#### 4.3 Table View
**ID**: `tableContainer`
**Visibility**: Hidden by default, shown when table view selected
**Structure**:
- **Table** (`indicesTable`): Full-width table
- **Columns**:
  1. **#**: Row number (10% width)
  2. **Index**: Index name
  3. **Value**: Current value
  4. **Change**: Percentage change (color-coded)
- **Body** (`indicesTableBody`): Dynamically populated rows

**Styling**:
- White background
- Rounded corners (15px)
- Shadow: 0 5px 15px rgba(0,0,0,0.1)
- Fixed table layout
- Font size: 0.8rem

**Functionality**:
- Toggle between card and table views
- View preference saved to localStorage
- Smooth transition between views

---

### 5. Market Breadth Section
**Location**: Below all indices section
**ID**: `advance-decline`
**Layout**: 2-column horizontal layout

**Components**:
- **Title**: "Market Breadth" (white text)
- **Breadth Container**:
  - **Advances** (`advances`): 
    - Label: "Advances"
    - Value: Dynamic count (green color)
    - Strong/bold text
  - **Declines** (`declines`):
    - Label: "Declines"
    - Value: Dynamic count (red color)
    - Strong/bold text

**Styling**:
- White background cards
- Rounded corners
- Color-coded values
- Side-by-side display

**Functionality**:
- Shows number of advancing vs declining stocks
- Updates with each data refresh
- Visual indicator of market direction

---

### 6. Data Source Info
**Location**: Below Market Breadth section
**Class**: `data-source-info`
**Components**:
- **Source Name** (`dataSource`): "NSE India" or "Uploaded Data • Static data from file"
- **Update Info** (`updateInfo`): "Updates every 30 sec. during market hrs."
- **Separator**: "•" (bullet point)

**Styling**:
- Font size: 0.75rem
- White text with opacity
- Centered or left-aligned

**Functionality**:
- Indicates current data source
- Shows update frequency
- Changes when uploaded data is selected

---

## Modals & Popups

### 1. Upload Modal
**ID**: `uploadModal`
**Trigger**: Click "Upload" button in footer menu
**Purpose**: Upload CSV/DAT files with NSE market data

#### Modal Structure:
```
┌─────────────────────────────────────┐
│  HEADER (Sticky)                    │
│  - Upload Icon + "Upload CSV Data" │
│  - Close Button (X)                 │
├─────────────────────────────────────┤
│  BODY (Scrollable)                  │
│  ┌───────────────────────────────┐ │
│  │ Upload NSE Data Section       │ │
│  │ - Instructions text           │ │
│  │ - Data Type Dropdown          │ │
│  │   • Indices                   │ │
│  │   • Bhav                      │ │
│  │   • Pre-market                │ │
│  │ - File Input (CSV/DAT)        │ │
│  │ - Date Picker                 │ │
│  │ - Upload Status Message       │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ Uploaded CSV Files Section    │ │
│  │ - Table with uploaded files   │ │
│  │   Columns:                    │ │
│  │   • No                        │ │
│  │   • Date (DD/MM format)       │ │
│  │   • Indi. (count)             │ │
│  │   • Bhav. (tick mark)         │ │
│  │   • PreM (tick mark)          │ │
│  │   • Actions (Export/Delete)   │ │
│  └───────────────────────────────┘ │
├─────────────────────────────────────┤
│  FOOTER (Sticky)                    │
│  - Upload Data Button (Primary)     │
│  - Cancel Button (Secondary)       │
└─────────────────────────────────────┘
```

#### Form Fields:

**1. Data Type Select** (`uploadType`):
- **Type**: Dropdown/Select
- **Options**:
  - "Select Type" (default, empty)
  - "Indices"
  - "Bhav"
  - "Pre-market"
- **Required**: Yes
- **Purpose**: Categorize uploaded data

**2. File Input** (`csvFile`):
- **Type**: File input (hidden, custom styled)
- **Accept**: `.csv`, `.dat`
- **Display**: Custom file picker button
  - Upload icon
  - Text: "Choose CSV or DAT file..."
  - Changes to filename after selection
- **Styling**: Dashed border, light gray background, hover effect

**3. Date Input** (`dataDate`):
- **Type**: Date picker
- **Format**: YYYY-MM-DD (HTML5 date input)
- **Required**: Yes
- **Purpose**: Associate data with specific date
- **Constraints**: 
  - Width: 100% of container
  - Max-width: 100% (prevents overflow)
  - Box-sizing: border-box

**4. Upload Status** (`uploadStatus`):
- **Visibility**: Hidden by default
- **States**:
  - Success: Green background, success message
  - Error: Red background, error message
- **Auto-hide**: After 5 seconds

#### Uploaded Files Table:

**Columns**:
1. **No**: Row number (1, 2, 3...)
2. **Date**: Formatted as DD/MM (e.g., "28/11")
   - Orange color text
3. **Indi.**: Indices count (number)
   - Orange color text
4. **Bhav.**: Tick mark (✓) if data exists, empty if not
5. **PreM**: Tick mark (✓) if data exists, empty if not
6. **Actions**: 
   - Export button (download icon)
   - Delete button (trash icon)

**Functionality**:
- Fetches data from 3 MongoDB collections (uploadedIndices, uploadedBhav, uploadedPreMarket)
- Groups by date (deduplicates)
- Shows counts and availability for each data type
- Export: Downloads data as CSV
- Delete: Removes data from database

**Modal Behavior**:
- **Scroll Lock**: Prevents body scrolling when open
- **Smooth Scroll**: Modal body scrolls smoothly
- **Sticky Header/Footer**: Header and footer remain visible while scrolling
- **Close Methods**:
  - Click X button
  - Click Cancel button
  - Click outside modal (backdrop)
- **Width**: 100% on mobile, max-width on desktop
- **Animation**: Slides up from bottom (0.3s ease-out)

---

### 2. Calendar Modal
**ID**: `calendarModal`
**Trigger**: Click calendar icon in "All Indices" section header
**Purpose**: Select date to view historical uploaded data

#### Modal Structure:
```
┌─────────────────────────────────────┐
│  HEADER (Sticky)                    │
│  - Calendar Icon + "Select Date"    │
│  - Close Button (X)                 │
├─────────────────────────────────────┤
│  BODY (Scrollable)                  │
│  ┌───────────────────────────────┐ │
│  │ Calendar Navigation            │ │
│  │ [<] November 2025 [>]          │ │
│  ├───────────────────────────────┤ │
│  │ SUN MON TUE WED THU FRI SAT    │ │
│  ├───────────────────────────────┤ │
│  │  1   2   3   4   5   6   7     │ │
│  │  8   9  10  11  12  13  14     │ │
│  │ 15  16  17  18  19  20  21     │ │
│  │ 22  23  24  25  26  27  28     │ │
│  │ 29  30   1   2   3   4   5     │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Calendar Features:

**Navigation**:
- **Previous Month** (`prevMonthBtn`): Left arrow button
- **Month/Year Display** (`calendarMonthYear`): Current month and year
- **Next Month** (`nextMonthBtn`): Right arrow button

**Date Display**:
- **Weekdays Header**: SUN, MON, TUE, WED, THU, FRI, SAT
- **Calendar Grid**: 7 columns × variable rows
- **Date Cells**:
  - **Normal Dates**: Black text, clickable
  - **Other Month Dates**: Gray text, semi-transparent
  - **Dates with Data**: 
    - Border color based on mood:
      - Green: Very Bullish/Bullish
      - Yellow: Slightly Bullish
      - Orange: Neutral
      - Red: Bearish/Very Bearish
    - Bold text
  - **Dates without Data**: Gray text, not clickable
  - **Selected Date**: Blue background, white text

**Functionality**:
- Shows only dates with uploaded data available
- Color-coded borders indicate market mood for that date
- Click date to load historical data
- Navigate between months
- Closes after date selection
- Scroll lock when open

---

### 3. Settings Modal
**ID**: `settingsModal`
**Trigger**: Click "Settings" button in footer menu
**Purpose**: Configure API settings and manage uploaded data

#### Modal Structure:
```
┌─────────────────────────────────────┐
│  HEADER (Sticky)                    │
│  - Bar Chart Icon + "Settings"      │
│  - Close Button (X)                 │
├─────────────────────────────────────┤
│  BODY (Scrollable)                  │
│  ┌───────────────────────────────┐ │
│  │ Uploaded Data Section          │ │
│  │ (if uploaded data exists)      │ │
│  │ - Data source info             │ │
│  │ - Date and indices count       │ │
│  │ - Clear Data Button (trash)    │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ Available APIs Section         │ │
│  │ - NSE India (default)          │ │
│  │ - Dhan API (with config)       │ │
│  │ - Upload CSV Data (with dates) │ │
│  └───────────────────────────────┘ │
├─────────────────────────────────────┤
│  FOOTER (Sticky)                    │
│  - Save Settings (Primary)          │
│  - Cancel (Secondary)                │
└─────────────────────────────────────┘
```

#### Settings Sections:

**1. Uploaded Data Section** (`uploadedDataSection`):
- **Visibility**: Only shown when uploaded data exists
- **Content**:
  - **Data Source**: "Uploaded Data • Static data from file"
  - **Date**: Selected date
  - **Indices Count**: Number of indices
  - **Clear Button**: Red trash icon (right side)
    - Deletes uploaded data
    - Confirmation dialog

**2. Available APIs Section** (`apiList`):
- **Dynamic List**: Populated from settings
- **API Types**:

  **a. NSE India**:
  - Type: `nse`
  - Default: Yes
  - No configuration needed
  - Radio button selection

  **b. Dhan API**:
  - Type: `dhan`
  - Configuration form:
    - Client ID (text input)
    - Access Token (text input)
    - API Key (text input, optional)
    - API Secret (text input, optional)
    - Custom Endpoint (text input, optional)
  - Test Connection button
  - Status indicator (success/failed)
  - Radio button selection

  **c. Upload CSV Data**:
  - Type: `uploaded`
  - Date dropdown:
    - Lists all available dates from uploaded data
    - Format: "DD/MM (X indices)"
    - Shows count for each date
  - Radio button selection
  - Only shown when uploaded data exists

**Functionality**:
- Select active API by clicking radio button
- Configure Dhan API credentials
- Test Dhan API connection before saving
- Select date for uploaded data
- Save settings to localStorage
- Reload app with new API on save
- Cancel discards changes

**Modal Behavior**:
- Scroll lock when open
- Sticky header/footer
- Smooth scrolling
- Close on backdrop click
- Close on Cancel button
- Save and reload on Save button

---

## Navigation & Footer Menu

### Floating Footer Menu
**Location**: Fixed bottom of screen
**ID**: `footer`
**Styling**: 
- White pill-shaped bar
- Rounded corners (50px border-radius)
- Shadow: 0 4px 20px rgba(0, 0, 0, 0.15)
- Backdrop filter blur
- Centered horizontally
- Position: Fixed bottom with safe area inset

**Scroll Behavior**:
- **Hide on Scroll Down**: Hides when scrolling down (after 100px)
- **Show on Scroll Up**: Shows when scrolling up
- **Smooth Transition**: 0.3s ease-in-out
- **Transform Animation**: Slides down/up

#### Menu Buttons (Left to Right):

**1. Refresh Button** (`refreshBtn`):
- **Icon**: Refresh/Reload icon
- **Label**: "Refresh"
- **Functionality**:
  - Manually triggers data fetch
  - Shows loading state
  - Updates all displayed data
  - Resets polling timer

**2. Settings Button** (`settingsBtn`):
- **Icon**: Bar chart icon (3 vertical bars)
- **Label**: "Settings"
- **Functionality**:
  - Opens Settings modal
  - Shows API configuration options
  - Manages uploaded data

**3. Signals Button** (`signalsBtn`):
- **Icon**: Activity/signal icon (zigzag line)
- **Label**: "Signals"
- **Functionality**:
  - Shows "All Indices" section
  - Smoothly scrolls to section
  - Expands collapsed indices view

**4. Upload Button** (`uploadBtn`):
- **Icon**: Upload icon (arrow up)
- **Label**: "Upload"
- **Functionality**:
  - Opens Upload modal
  - Allows CSV/DAT file upload
  - Shows uploaded files list

**5. Logout Button** (`logoutBtn`):
- **Icon**: Logout icon (door with arrow)
- **Label**: "Logout"
- **Visibility**: Hidden by default, shown when logged in
- **Functionality**:
  - Confirmation dialog
  - Clears localStorage
  - Redirects to login page

**Button Styling**:
- Flex column layout (icon above label)
- Icon size: 22x22px
- Label font: 0.7rem, uppercase, letter-spaced
- Color: Gray (#6b7280)
- Hover: Light background, darker text
- Active: Scale down (0.95)
- Equal width distribution

---

## Functionalities & Features

### 1. Real-Time Data Fetching

**API Endpoints**:
- **NSE India API**: `/api/nse-data`
  - Fetches from NSE India official API
  - No authentication required
  - Rate limited by NSE
  
- **Dhan API**: `/api/dhan-data`
  - Requires credentials (Client ID, Access Token)
  - Optional: API Key, API Secret, Custom Endpoint
  - Test connection before use

**Polling Mechanism**:
- **Interval**: 30 seconds during market hours
- **Auto-start**: When market is detected as open
- **Auto-stop**: When market closes
- **Manual Refresh**: Available via Refresh button
- **Error Handling**: 
  - Retries on failure (max 2 retries)
  - Shows mock data as fallback
  - Tracks consecutive failures

**Market Status Detection**:
- **Time-based**: Checks if current time is within market hours (9:15 AM - 3:30 PM IST)
- **API-based**: Verifies if API returns live data
- **Combined**: Uses both methods for accuracy

---

### 2. Market Mood Calculation

**Algorithm**:
1. **NIFTY 50 Performance** (40% weight):
   - Positive change: +40 points
   - Negative change: -40 points
   - Scaled based on percentage change

2. **All Indices Performance** (30% weight):
   - Counts positive vs negative indices
   - Calculates ratio
   - Applies weight

3. **Market Breadth** (30% weight):
   - Advances vs Declines ratio
   - Normalized to 0-30 points

**Score Ranges**:
- **70-100**: Very Bullish 😊
- **60-69**: Bullish 🙂
- **40-59**: Neutral 😐
- **30-39**: Bearish 😕
- **0-29**: Very Bearish 😟

**Visual Feedback**:
- Background color changes based on mood
- Gradient transitions
- Emoji representation
- Score bar animation

---

### 3. Data Upload & Management

**Supported File Formats**:
- **CSV**: Comma-separated values
- **DAT**: Delimited text files (various delimiters)

**Data Types**:
1. **Indices**: NSE index data
2. **Bhav**: Bhavcopy data
3. **Pre-market**: Pre-market data

**Upload Process**:
1. Select data type from dropdown
2. Choose file (CSV or DAT)
3. Select date for the data
4. Click "Upload Data"
5. File is parsed and validated
6. Data saved to MongoDB (separate collections per type)
7. Success/error message displayed

**Data Storage**:
- **Database**: MongoDB
- **Collections**:
  - `uploadedIndices`: Indices data
  - `uploadedBhav`: Bhav data
  - `uploadedPreMarket`: Pre-market data
- **Fields**:
  - `fileName`: Original filename
  - `date`: Selected date (YYYY-MM-DD)
  - `indices`: Array of index objects
  - `mood`: Calculated mood score
  - `vix`: VIX value
  - `advanceDecline`: Market breadth data
  - `uploadedAt`: Timestamp
  - `type`: Data type (indices/bhav/premarket)

**Data Retrieval**:
- Fetches from database by date
- Groups by date (deduplicates)
- Shows counts per data type
- Displays in uploaded files table

**Data Management**:
- **Export**: Download as CSV
- **Delete**: Remove from database
- **Clear All**: Remove all uploaded data (with confirmation)

---

### 4. Historical Data Viewing

**Date Selection**:
- Calendar modal shows dates with available data
- Color-coded borders indicate mood for each date
- Click date to load historical data
- Navigate between months

**Data Loading**:
- Fetches data for selected date
- Updates all UI components
- Shows date in data source info
- Disables auto-refresh (static data)

**View Modes**:
- **Card View**: 2-column grid of index cards
- **Table View**: Full-width table with all indices
- **Toggle**: Switch between views
- **Preference**: Saved to localStorage

---

### 5. View Management

**Card View**:
- 2-column responsive grid
- Oval white cards
- Centered content
- Color-coded changes
- Smooth transitions

**Table View**:
- Full-width table
- Sortable columns
- Color-coded changes
- Row numbers
- Compact display

**View Persistence**:
- Selected view saved to localStorage
- Restored on page load
- Toggle buttons show active state

---

### 6. Responsive Design

**Breakpoints**:
- **Mobile**: < 480px
- **Tablet**: 480px - 768px
- **Desktop**: > 768px

**Mobile Optimizations**:
- Full-width modals
- Reduced padding
- Smaller fonts
- Touch-friendly buttons
- Safe area insets (iOS)

**Desktop Optimizations**:
- Centered container (max-width: 400px)
- Larger modals (max-width: 500px)
- More spacing
- Hover effects

---

### 7. PWA Features

**Installability**:
- Web App Manifest (`manifest.json`)
- Service Worker (`sw.js`)
- Install prompt support
- Standalone mode

**Offline Support**:
- Service Worker caching
- Offline page (if implemented)
- Cached static assets

**App-like Experience**:
- Full-screen mode
- No browser UI
- Custom theme color
- Dynamic Island support (iOS)
- Safe area insets

**Theme Color**:
- Dynamic based on market mood
- Updates meta tag
- Affects status bar (iOS)
- Affects Dynamic Island area

---

## Data Flow & API Integration

### Data Fetching Flow

```
User Action / Timer
    ↓
loadData()
    ↓
Determine API (NSE/Dhan/Uploaded)
    ↓
Fetch from API
    ↓
Process Data
    ↓
Calculate Mood Score
    ↓
Update UI Components
    ↓
Start/Stop Polling (if market open)
```

### API Response Structure

**NSE API Response**:
```javascript
{
  indices: [
    {
      symbol: "NIFTY 50",
      lastPrice: 21500.45,
      change: 125.50,
      pChange: 0.59
    },
    // ... more indices
  ],
  vix: {
    last: 14.25,
    change: -0.35,
    pChange: -2.40
  },
  advanceDecline: {
    advances: 28,
    declines: 17
  },
  marketStatus: {
    isOpen: true,
    verified: true
  }
}
```

**Dhan API Response**:
- Similar structure
- Requires authentication
- May have different field names

**Uploaded Data Response**:
- Same structure as API response
- Static (no updates)
- Date-specific

---

## User Interactions & UX

### Scroll Interactions

**Elastic Scroll**:
- Bounce effect at top/bottom boundaries
- Native on iOS
- CSS animation on other browsers
- Visual feedback when reaching limits

**Footer Hide/Show**:
- Hides when scrolling down (after 100px)
- Shows when scrolling up
- Smooth animation
- Prevents obstruction

**Scroll Lock**:
- Body scroll locked when modal open
- Only modal content scrolls
- Prevents background scrolling
- Smooth scroll behavior

---

### Touch Interactions

**Swipe Gestures**:
- Not currently implemented
- Potential: Swipe to refresh, swipe between dates

**Tap Interactions**:
- Buttons: Immediate feedback
- Cards: Hover effects (desktop)
- Modals: Backdrop click to close

**Long Press**:
- Not currently implemented
- Potential: Context menus, quick actions

---

### Visual Feedback

**Loading States**:
- Refresh button disabled during load
- Loading spinner (if implemented)
- Skeleton screens (if implemented)

**Success/Error States**:
- Upload status messages
- API connection status
- Color-coded feedback

**Animations**:
- Modal slide-up (0.3s)
- Score bar fill (0.5s)
- Footer hide/show (0.3s)
- Elastic bounce (0.3s)

---

## Responsive Design & PWA Features

### Mobile-First Design

**Viewport**:
- `viewport-fit=cover`: Full screen on iOS
- Safe area insets: Respects notches/Dynamic Island
- Minimum width: 320px

**Touch Targets**:
- Minimum 44x44px
- Adequate spacing
- No overlapping elements

**Typography**:
- Scalable fonts (rem units)
- Readable sizes (minimum 0.65rem)
- Line height: 1.5

---

### PWA Implementation

**Manifest** (`manifest.json`):
```json
{
  "name": "NSE Market Mood",
  "short_name": "MarketMood",
  "display": "standalone",
  "theme_color": "#667eea",
  "background_color": "#667eea",
  "orientation": "portrait",
  "icons": [...]
}
```

**Service Worker** (`sw.js`):
- Caches static assets
- Never caches API requests
- Offline fallback (if implemented)

**Installation**:
- Add to Home Screen prompt
- Standalone mode
- App-like experience

---

### iOS-Specific Features

**Dynamic Island Support**:
- Safe area overlay
- Theme color extends to notch area
- Background color matches mood
- Works in PWA mode

**Status Bar**:
- `black-translucent`: Allows background to show
- Theme color visible
- Matches app background

**Safe Area Insets**:
- Top padding: `env(safe-area-inset-top)`
- Bottom padding: `env(safe-area-inset-bottom)`
- Footer positioning respects safe areas

---

## Technical Implementation

### Architecture

**Frontend**:
- Vanilla JavaScript (ES6+)
- No frameworks
- Modular class structure
- Event-driven

**Backend**:
- Vercel Serverless Functions
- Node.js
- MongoDB (via API)

**Data Storage**:
- **LocalStorage**: Settings, view preferences
- **MongoDB**: Uploaded data, historical data
- **Session**: None (stateless)

---

### Key Classes

**1. MarketMoodApp** (`app.js`):
- Main application class
- Manages data fetching
- UI updates
- Polling logic
- View management

**2. SettingsManager** (`settings.js`):
- Settings management
- API configuration
- Uploaded data handling
- LocalStorage operations

---

### Key Methods

**Data Fetching**:
- `loadData()`: Fetches data from API
- `updateUI()`: Updates all UI components
- `startPolling()`: Starts auto-refresh
- `stopPolling()`: Stops auto-refresh

**UI Updates**:
- `updateBackgroundColor()`: Changes theme based on mood
- `updateThemeColor()`: Updates PWA theme color
- `renderIndicesCards()`: Renders card view
- `renderIndicesTable()`: Renders table view
- `updateMoodCard()`: Updates mood display

**File Handling**:
- `parseCSV()`: Parses CSV files
- `parseDATFile()`: Parses DAT files
- `setupUpload()`: Configures upload functionality
- `uploadData()`: Uploads data to server

**Settings**:
- `loadSettings()`: Loads from localStorage
- `saveSettings()`: Saves to localStorage
- `applySettings()`: Applies settings to UI
- `updateApiList()`: Updates API selection UI

---

### State Management

**Application State**:
- `viewMode`: 'card' or 'table'
- `lastMarketStatus`: Market open/closed status
- `consecutiveFailures`: Error tracking
- `timerId`: Polling timer reference

**LocalStorage Keys**:
- `nseMarketMoodSettings`: Settings object
- `indicesViewMode`: View preference
- `uploadedMarketData`: Uploaded data (legacy)
- `isLoggedIn`: Login status
- `userEmail`: User email

---

### Error Handling

**API Errors**:
- Retry mechanism (max 2 retries)
- Fallback to mock data
- Error messages displayed
- Consecutive failure tracking

**Upload Errors**:
- File validation
- Parse error handling
- Network error handling
- User-friendly error messages

**General Errors**:
- Try-catch blocks
- Console logging
- Graceful degradation
- User notifications

---

## Future Development Considerations

### Potential Enhancements

1. **Authentication**:
   - User accounts
   - Data persistence per user
   - Multi-user support

2. **Advanced Analytics**:
   - Historical charts
   - Trend analysis
   - Predictive indicators

3. **Notifications**:
   - Push notifications
   - Market alerts
   - Price alerts

4. **Social Features**:
   - Share mood
   - Compare dates
   - Community insights

5. **Performance**:
   - Virtual scrolling for large datasets
   - Lazy loading
   - Image optimization

6. **Accessibility**:
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

---

## Conclusion

This documentation provides a comprehensive overview of the NSE Market Mood application, covering all UI components, functionalities, user interactions, and technical implementation details. Use this as a reference for further development, feature additions, or modifications.

For questions or clarifications, refer to the source code in:
- `public/index.html`: HTML structure
- `public/app.js`: Main application logic
- `public/settings.js`: Settings management
- `public/styles.css`: Styling and layout
- `api/`: Backend API endpoints

