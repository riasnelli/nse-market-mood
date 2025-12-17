# API Authentication Setup Guide

## 🔐 Overview

All API endpoints are now protected with authentication and rate limiting to prevent abuse. This document explains how to configure and use the authentication system.

## 📋 Quick Setup

### 1. Get Your API Key

The API key is stored in the environment variable `API_KEY` or `NSE_MARKET_MOOD_API_KEY` on the server.

**For Development/Testing:**
- Default key: `default-secret-key-change-in-production` (⚠️ Change this in production!)
- Set in Vercel environment variables: `API_KEY=your-secure-random-key`

**For Production:**
- Generate a strong random key (at least 32 characters)
- Set it in Vercel: Project Settings → Environment Variables → Add `API_KEY`

### 2. Configure API Key in Frontend

Open browser console and run:
```javascript
localStorage.setItem('nseMarketMoodApiKey', 'your-api-key-here');
```

Or add it to the Settings modal (if implemented).

## 🔑 Authentication Methods

API keys can be provided in three ways:

1. **Header (Recommended):**
   ```
   X-API-Key: your-api-key-here
   ```

2. **Authorization Header:**
   ```
   Authorization: Bearer your-api-key-here
   ```

3. **Query Parameter:**
   ```
   ?apiKey=your-api-key-here
   ```

## 🛡️ Protected Endpoints

### Write Operations (Require Authentication)

- **POST** `/api/save-uploaded-data` - Upload CSV data
- **DELETE** `/api/save-uploaded-data` - Delete uploaded data
- **POST** `/api/flush-uploaded-data` - Flush all uploaded data (Critical)
- **POST** `/api/download-nse-csvs` - Download CSVs from NSE
- **POST** `/api/generate-signals` - Generate trading signals

### Read Operations (Rate Limited, No Auth Required)

- **GET** `/api/nse-data` - Fetch NSE data (100 req/min)
- **GET** `/api/dhan-data` - Fetch Dhan data (100 req/min)
- **GET** `/api/get-uploaded-data` - Get uploaded data (100 req/min)
- **GET** `/api/get-signals` - Get signals (100 req/min)

## ⚡ Rate Limits

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| **Public (Read)** | 100 requests | 1 minute |
| **Write** | 20 requests | 1 minute |
| **Critical** | 5 requests | 1 minute |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## ❌ Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "API key required for this operation."
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 45 seconds.",
  "retryAfter": 45
}
```

## 🔧 Frontend Integration

The frontend automatically includes API keys in requests using `api-config.js`:

```javascript
// Automatic authentication
const response = await apiConfig.fetch('/api/save-uploaded-data', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

## 🚀 Production Checklist

- [ ] Change default API key in `api/lib/auth.js`
- [ ] Set `API_KEY` environment variable in Vercel
- [ ] Use strong random key (32+ characters)
- [ ] Never commit API keys to Git
- [ ] Rotate keys periodically
- [ ] Monitor rate limit usage
- [ ] Set up alerts for abuse detection

## 📝 Example: Setting API Key

### Via Browser Console
```javascript
// Set API key
localStorage.setItem('nseMarketMoodApiKey', 'your-production-key');

// Verify it's set
console.log(localStorage.getItem('nseMarketMoodApiKey'));

// Clear API key
localStorage.removeItem('nseMarketMoodApiKey');
```

### Via cURL
```bash
# With header
curl -X POST https://your-app.vercel.app/api/save-uploaded-data \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"data": "..."}'

# With query parameter
curl -X POST "https://your-app.vercel.app/api/save-uploaded-data?apiKey=your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"data": "..."}'
```

## 🔍 Troubleshooting

### "API key required" error
- Check if API key is set in localStorage
- Verify environment variable is set on server
- Check browser console for authentication errors

### "Rate limit exceeded" error
- Wait for the reset time (check `X-RateLimit-Reset` header)
- Reduce request frequency
- Use request batching where possible

### API key not working
- Verify key matches server environment variable exactly
- Check for extra spaces or characters
- Ensure key is set before making requests

## 🔐 Security Best Practices

1. **Never expose API keys in client-side code**
   - Keys should be in environment variables only
   - Use different keys for different environments

2. **Use HTTPS only**
   - All API requests should use HTTPS
   - Never send keys over HTTP

3. **Rotate keys regularly**
   - Change keys every 90 days
   - Immediately rotate if compromised

4. **Monitor usage**
   - Check Vercel logs for unusual patterns
   - Set up alerts for high request volumes

5. **Limit key scope**
   - Use different keys for different operations if needed
   - Revoke keys that are no longer needed

## 📞 Support

If you encounter authentication issues:
1. Check this guide first
2. Verify environment variables in Vercel
3. Check browser console for detailed error messages
4. Review server logs in Vercel dashboard
