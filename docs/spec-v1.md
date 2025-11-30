# NSE Market Mood - Specification v1.0

## Document Information
- **Version**: 1.0
- **Date**: November 2025
- **Status**: Phase 1 - UI Complete
- **Branch**: Phase1_UI

---

## Table of Contents
1. [Overview](#overview)
2. [Application Architecture](#application-architecture)
3. [User Interface Specifications](#user-interface-specifications)
4. [Feature Specifications](#feature-specifications)
5. [Data Management](#data-management)
6. [API Integration](#api-integration)
7. [Technical Stack](#technical-stack)
8. [Deployment](#deployment)
9. [Future Enhancements](#future-enhancements)

---

## Overview

### Application Purpose
NSE Market Mood is a Progressive Web App (PWA) that provides real-time market sentiment analysis for the National Stock Exchange (NSE) of India. The application displays market mood indicators, index data, market breadth, and allows users to upload historical data for analysis.

### Key Characteristics
- **Type**: Single Page Application (SPA) / Progressive Web App
- **Platform**: Mobile-first, optimized for iOS and Android
- **Data Sources**: NSE India API, Dhan API, User-uploaded CSV/DAT files
- **Update Frequency**: Auto-refresh every 30 seconds during market hours
- **Installable**: Yes (PWA)

---

## Application Architecture

### Frontend Structure
```
public/
├── index.html          # Main application page
├── login.html          # Login page
├── app.js              # Main application logic
├── settings.js         # Settings management
├── styles.css          # All styling
├── sw.js              # Service worker (PWA)
├── manifest.json      # PWA manifest
└── icons/             # App icons
```

### Backend Structure
```
api/
├── nse-data.js        # NSE India API endpoint
├── dhan-data.js       # Dhan API endpoint
├── save-uploaded-data.js  # Upload data management
├── get-uploaded-dates.js  # Get available dates
├── get-uploaded-data.js   # Get data by date
└── lib/
    └── mongodb.js     # MongoDB connection
```

### Data Storage
- **LocalStorage**: Settings, view preferences, API keys
- **MongoDB**: Uploaded data (indices, bhav, premarket)
- **Collections**:
  - `uploadedIndices`
  - `uploadedBhav`
  - `uploadedPreMarket`

---

## User Interface Specifications

### Main Dashboard Layout

#### 1. Header Section
- **Logo**: SVG icon (32x32px, white)
- **Title**: "NSE Market Mood" (1.8rem, white)
- **Last Updated**: Dynamic timestamp

#### 2. Mood Card
- **Emoji Display**: 4rem emoji (😊/🙂/😐/😕/😟)
- **Mood Text**: 1.5rem, bold
- **Score Bar**: Horizontal gradient (red → orange → green)
- **Score Text**: "XX/100" format
- **Background**: Dynamic gradient based on mood

#### 3. Main Indices Grid
- **Layout**: 2-column grid
- **Indices**: NIFTY 50, BANK NIFTY, VIX, Additional
- **Card Style**: White, rounded (20px), shadow
- **Content**: Index name, value, change percentage

#### 4. All Indices Section
- **Header**: Title + Calendar icon + View toggle icons
- **Views**: Card view (2-column grid) or Table view
- **Cards**: Same style as main indices
- **Table**: Full-width with columns (#, Index, Value, Change)

#### 5. Market Breadth
- **Layout**: 2-column horizontal
- **Components**: Advances (green), Declines (red)
- **Style**: White cards, color-coded values

#### 6. Data Source Info
- **Text**: "NSE India • Updates every 30 sec. during market hrs."
- **Font Size**: 0.75rem
- **Color**: White with opacity

#### 7. Floating Footer Menu
- **Position**: Fixed bottom, centered
- **Style**: White pill-shaped bar, shadow
- **Buttons**: Refresh, Settings, Signals, Upload, Menu
- **Behavior**: Hides on scroll down, shows on scroll up

---

## Feature Specifications

### 1. Real-Time Data Fetching
- **Polling Interval**: 30 seconds
- **Auto-start**: When market is open
- **Auto-stop**: When market closes
- **Manual Refresh**: Available via button
- **Error Handling**: Retry mechanism (max 2 retries)

### 2. Market Mood Calculation
**Algorithm**:
- NIFTY 50 Performance: 40% weight
- All Indices Performance: 30% weight
- Market Breadth: 30% weight

**Score Ranges**:
- 70-100: Very Bullish 😊
- 60-69: Bullish 🙂
- 40-59: Neutral 😐
- 30-39: Bearish 😕
- 0-29: Very Bearish 😟

### 3. Data Upload & Management
**Supported Formats**:
- CSV (comma-separated)
- DAT (various delimiters)

**Data Types**:
1. Indices
2. Bhav
3. Pre-market

**Storage**: Separate MongoDB collections per type

**Features**:
- Date selection
- File validation
- Parse and save to database
- Export as CSV
- Delete functionality

### 4. Historical Data Viewing
- **Calendar Modal**: Shows dates with available data
- **Color Coding**: Mood-based borders on calendar dates
- **Date Selection**: Click date to load historical data
- **Navigation**: Previous/Next month buttons

### 5. View Management
- **Card View**: 2-column responsive grid
- **Table View**: Full-width table
- **Toggle**: Switch between views
- **Persistence**: Saved to localStorage

### 6. Settings Management
**API Options**:
- NSE India (default)
- Dhan API (with credentials)
- Upload CSV Data (with date selection)

**Features**:
- API selection
- Credential configuration
- Test connection (Dhan API)
- Save/Cancel functionality

### 7. AI Connect
**OpenRouter Integration**:
- API key input (password field)
- Connection status display
- Masked key preview
- Delete functionality
- Status indicator in menu

**Storage**:
- Saved to settings
- Backup in localStorage
- Persists across devices

---

## Data Management

### Data Flow
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

### Data Structures

#### Market Data Response
```javascript
{
  indices: [
    {
      symbol: "NIFTY 50",
      lastPrice: 21500.45,
      change: 125.50,
      pChange: 0.59
    }
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

#### Uploaded Data Structure
```javascript
{
  fileName: "data.csv",
  date: "2025-11-28",
  type: "indices" | "bhav" | "premarket",
  indices: [...],
  mood: 65,
  vix: 14.25,
  advanceDecline: { advances: 28, declines: 17 },
  uploadedAt: "2025-11-28T10:00:00Z"
}
```

---

## API Integration

### Endpoints

#### 1. NSE India API
- **Endpoint**: `/api/nse-data`
- **Method**: GET
- **Auth**: None required
- **Rate Limit**: NSE enforced

#### 2. Dhan API
- **Endpoint**: `/api/dhan-data`
- **Method**: GET
- **Auth**: Client ID, Access Token required
- **Optional**: API Key, API Secret, Custom Endpoint

#### 3. Upload Data
- **Save**: `POST /api/save-uploaded-data`
- **Get Dates**: `GET /api/get-uploaded-dates?type={type}`
- **Get Data**: `GET /api/get-uploaded-data?date={date}&type={type}`
- **Delete**: `DELETE /api/save-uploaded-data?id={id}&type={type}`

---

## Technical Stack

### Frontend
- **Language**: JavaScript (ES6+)
- **Framework**: Vanilla JS (no framework)
- **Styling**: CSS3 with custom properties
- **Icons**: SVG inline
- **Storage**: localStorage API

### Backend
- **Platform**: Vercel Serverless Functions
- **Runtime**: Node.js
- **Database**: MongoDB
- **HTTP Client**: node-fetch

### PWA Features
- **Manifest**: Web App Manifest
- **Service Worker**: Caching strategy
- **Installable**: Yes
- **Offline**: Partial support

### Responsive Design
- **Breakpoints**:
  - Mobile: < 480px
  - Tablet: 480px - 768px
  - Desktop: > 768px
- **Safe Areas**: iOS Dynamic Island support
- **Touch Targets**: Minimum 44x44px

---

## Deployment

### Platform
- **Hosting**: Vercel
- **CDN**: Automatic via Vercel
- **SSL**: Automatic HTTPS
- **Domain**: Custom domain support

### Configuration
- **Build**: No build step required
- **Routes**: Configured in `vercel.json`
- **Environment Variables**: MongoDB URI, API keys

### Deployment Process
1. Push to GitHub
2. Vercel auto-deploys
3. Preview URL generated
4. Production promotion (manual)

---

## User Interactions

### Scroll Behavior
- **Elastic Scroll**: Bounce effect at boundaries
- **Footer Hide/Show**: Hides on scroll down, shows on scroll up
- **Scroll Lock**: Prevents body scroll when modal open

### Modal Behavior
- **Open**: Slide up animation (0.3s)
- **Close**: Click X, Cancel, or backdrop
- **Scroll**: Modal body scrolls, header/footer sticky
- **Lock**: Body scroll locked when modal open

### Touch Interactions
- **Buttons**: Immediate feedback
- **Cards**: Hover effects (desktop)
- **Modals**: Backdrop click to close

---

## State Management

### Application State
- `viewMode`: 'card' or 'table'
- `lastMarketStatus`: Market open/closed
- `consecutiveFailures`: Error tracking
- `timerId`: Polling timer reference

### LocalStorage Keys
- `nseMarketMoodSettings`: Settings object
- `indicesViewMode`: View preference
- `openRouterApiKey`: OpenRouter API key
- `isLoggedIn`: Login status
- `userEmail`: User email

---

## Error Handling

### API Errors
- Retry mechanism (max 2 retries)
- Fallback to mock data
- Error messages displayed
- Consecutive failure tracking

### Upload Errors
- File validation
- Parse error handling
- Network error handling
- User-friendly messages

### General Errors
- Try-catch blocks
- Console logging
- Graceful degradation
- User notifications

---

## Security Considerations

### API Keys
- Stored in localStorage (client-side)
- Masked in UI display
- Delete functionality available
- No server-side storage

### Data Privacy
- User data stored locally
- Uploaded data stored in MongoDB
- No user authentication (Phase 1)
- No data sharing

---

## Performance Optimizations

### Loading
- Lazy loading for modals
- Efficient DOM updates
- Minimal re-renders

### Caching
- Service worker caching
- Static assets cached
- API requests not cached

### Network
- Polling only during market hours
- Efficient data fetching
- Minimal payload sizes

---

## Accessibility

### Current State
- Basic semantic HTML
- Color contrast considerations
- Touch target sizes

### Future Improvements
- ARIA labels
- Keyboard navigation
- Screen reader support
- Focus management

---

## Browser Support

### Supported
- Chrome/Edge (latest)
- Safari (latest, iOS 12+)
- Firefox (latest)
- Mobile browsers

### Features
- PWA support (iOS 12.2+, Android 5+)
- Safe area insets (iOS 11+)
- Service workers (modern browsers)

---

## Future Enhancements

### Phase 2 - AI Features
- AI-powered market analysis
- Predictive indicators
- Natural language queries
- Market insights

### Phase 3 - Social Features
- Share mood
- Compare dates
- Community insights
- User comments

### Phase 4 - Advanced Analytics
- Historical charts
- Trend analysis
- Technical indicators
- Custom dashboards

### Phase 5 - Authentication
- User accounts
- Data persistence per user
- Multi-user support
- Cloud sync

---

## Testing Considerations

### Manual Testing
- Market hours vs off-hours
- Different API sources
- File upload scenarios
- Modal interactions
- Scroll behavior

### Edge Cases
- No internet connection
- API failures
- Invalid file formats
- Large file uploads
- Date boundary conditions

---

## Known Limitations

1. **No User Authentication**: All data is local/device-specific
2. **Client-Side Storage**: API keys stored in localStorage
3. **No Real-Time Sync**: Data doesn't sync across devices
4. **Limited Offline**: Basic offline support only
5. **No Data Export**: Limited export functionality

---

## Version History

### v1.0 (Phase 1 - UI Complete)
- Complete UI implementation
- Real-time data fetching
- Upload functionality
- Settings management
- AI Connect integration
- PWA support
- Responsive design
- Cross-device status display

---

## Contact & Support

- **Repository**: https://github.com/riasnelli/nse-market-mood
- **Documentation**: See `APP_DOCUMENTATION.md` for detailed UI/UX specs

---

## Appendix

### Key Files Reference
- `public/index.html`: Main UI structure
- `public/app.js`: Application logic
- `public/settings.js`: Settings management
- `public/styles.css`: All styling
- `api/nse-data.js`: NSE API endpoint
- `api/dhan-data.js`: Dhan API endpoint
- `vercel.json`: Deployment configuration

### Code Patterns
- Class-based architecture
- Event-driven interactions
- Async/await for API calls
- LocalStorage for persistence
- Service worker for caching

---

**End of Specification v1.0**

