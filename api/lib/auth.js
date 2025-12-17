/**
 * Authentication and Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

// In-memory rate limit store (for serverless, consider Redis for production)
const rateLimitStore = new Map();

/**
 * Clean up old rate limit entries (older than 1 hour)
 */
function cleanupRateLimit() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.firstRequest < oneHourAgo) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 10 minutes
setInterval(cleanupRateLimit, 10 * 60 * 1000);

/**
 * Generate a simple API key from environment variable or use default
 * In production, use strong random keys stored securely
 */
function getApiKey() {
  return process.env.API_KEY || process.env.NSE_MARKET_MOOD_API_KEY || 'default-secret-key-change-in-production';
}

/**
 * Verify API key from request
 */
function verifyApiKey(req) {
  // Get API key from headers, query params, or body
  const apiKey = 
    req.headers['x-api-key'] || 
    req.headers['authorization']?.replace('Bearer ', '') ||
    req.query?.apiKey ||
    req.body?.apiKey;

  const validKey = getApiKey();
  
  // Allow requests without key for public endpoints (like nse-data GET)
  // But require key for write operations
  return apiKey === validKey;
}

/**
 * Get client identifier for rate limiting
 */
function getClientId(req) {
  // Use IP address or API key as identifier
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
             req.headers['x-real-ip'] || 
             req.connection?.remoteAddress ||
             'unknown';
  
  const apiKey = req.headers['x-api-key'] || req.query?.apiKey || 'anonymous';
  
  // Use API key if provided, otherwise use IP
  return apiKey !== 'anonymous' ? `key:${apiKey}` : `ip:${ip}`;
}

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
  // Public read endpoints (more lenient)
  public: {
    requests: 100, // requests per window
    window: 60 * 1000, // 1 minute
  },
  // Write endpoints (stricter)
  write: {
    requests: 20, // requests per window
    window: 60 * 1000, // 1 minute
  },
  // Critical operations (very strict)
  critical: {
    requests: 5, // requests per window
    window: 60 * 1000, // 1 minute
  }
};

/**
 * Check rate limit for a client
 */
function checkRateLimit(clientId, limitType = 'public') {
  const limit = RATE_LIMITS[limitType] || RATE_LIMITS.public;
  const now = Date.now();
  
  let clientData = rateLimitStore.get(clientId);
  
  if (!clientData) {
    // First request
    clientData = {
      firstRequest: now,
      requests: 1,
      resetTime: now + limit.window
    };
    rateLimitStore.set(clientId, clientData);
    return { allowed: true, remaining: limit.requests - 1 };
  }
  
  // Reset if window expired
  if (now > clientData.resetTime) {
    clientData.requests = 1;
    clientData.resetTime = now + limit.window;
    rateLimitStore.set(clientId, clientData);
    return { allowed: true, remaining: limit.requests - 1 };
  }
  
  // Check if limit exceeded
  if (clientData.requests >= limit.requests) {
    return { 
      allowed: false, 
      remaining: 0,
      resetTime: clientData.resetTime
    };
  }
  
  // Increment request count
  clientData.requests++;
  rateLimitStore.set(clientId, clientData);
  
  return { 
    allowed: true, 
    remaining: limit.requests - clientData.requests 
  };
}

/**
 * Authentication middleware
 * @param {Object} options - Configuration options
 * @param {boolean|Function} options.requireAuth - Require authentication (default: true for POST/DELETE). Can be a function that receives req.
 * @param {string|Function} options.rateLimitType - Rate limit type: 'public', 'write', 'critical'. Can be a function that receives req.
 * @param {Function} handler - The actual API handler function
 */
function authMiddleware(options = {}) {
  return (handler) => {
    return async (req, res) => {
    // Enable CORS first
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Key, Authorization'
    );

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Handle function-based options
    const requireAuthValue = typeof options.requireAuth === 'function' 
      ? options.requireAuth(req) 
      : (options.requireAuth !== false && (req.method === 'POST' || req.method === 'DELETE'));
    
    const rateLimitTypeValue = typeof options.rateLimitType === 'function'
      ? options.rateLimitType(req)
      : (options.rateLimitType || (requireAuthValue ? 'write' : 'public'));
    
    const requireAuth = requireAuthValue;
    const rateLimitType = rateLimitTypeValue;
    
    // Get client identifier
    const clientId = getClientId(req);
    
    // Check rate limit
    const rateLimit = checkRateLimit(clientId, rateLimitType);
    
    if (!rateLimit.allowed) {
      const resetSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${resetSeconds} seconds.`,
        retryAfter: resetSeconds
      });
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMITS[rateLimitType].requests);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetTime / 1000));
    
    // Check authentication for write operations
    if (requireAuth) {
      if (!verifyApiKey(req)) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'API key required for this operation. Please provide X-API-Key header or apiKey parameter.'
        });
      }
    }
    
    // Call the actual handler
    try {
      await handler(req, res);
    } catch (error) {
      console.error('API Error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error.message
        });
      }
    }
    };
  };
}

/**
 * Get API key for frontend (if allowed)
 * This should be called from a protected endpoint
 */
function getPublicApiInfo() {
  // Don't expose the actual key, just info about auth requirements
  return {
    requiresAuth: true,
    authMethods: ['X-API-Key header', 'apiKey query parameter', 'apiKey in body'],
    rateLimits: {
      public: `${RATE_LIMITS.public.requests} requests per minute`,
      write: `${RATE_LIMITS.write.requests} requests per minute`,
      critical: `${RATE_LIMITS.critical.requests} requests per minute`
    }
  };
}

module.exports = {
  authMiddleware,
  verifyApiKey,
  checkRateLimit,
  getPublicApiInfo,
  getApiKey
};
