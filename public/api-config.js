/**
 * API Configuration and Authentication
 * Handles API key management and authenticated fetch requests
 */

class ApiConfig {
  constructor() {
    this.apiKey = null;
    this.loadApiKey();
  }

  /**
   * Load API key from localStorage or environment
   */
  loadApiKey() {
    // Try to get from localStorage first (user-configured)
    this.apiKey = localStorage.getItem('nseMarketMoodApiKey');
    
    // If not in localStorage, try to get from a secure source
    // In production, this could be from a secure cookie or server-side config
    if (!this.apiKey) {
      // For now, use a default key that should be changed in production
      // This should be set via environment variable on the server
      console.warn('⚠️ API key not found in localStorage. Some operations may fail.');
      console.warn('💡 Set API key in localStorage: localStorage.setItem("nseMarketMoodApiKey", "your-key")');
    }
  }

  /**
   * Set API key
   */
  setApiKey(key) {
    this.apiKey = key;
    if (key) {
      localStorage.setItem('nseMarketMoodApiKey', key);
    } else {
      localStorage.removeItem('nseMarketMoodApiKey');
    }
  }

  /**
   * Get API key
   */
  getApiKey() {
    return this.apiKey;
  }

  /**
   * Create authenticated fetch options
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    
    return headers;
  }

  /**
   * Make authenticated fetch request
   */
  async fetch(url, options = {}) {
    const authHeaders = this.getAuthHeaders();
    
    const fetchOptions = {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers || {})
      }
    };

    // Add API key to query params as fallback if not in headers
    if (this.apiKey && !fetchOptions.headers['X-API-Key']) {
      const urlObj = new URL(url, window.location.origin);
      urlObj.searchParams.set('apiKey', this.apiKey);
      url = urlObj.toString();
    }

    try {
      const response = await window.fetch(url, fetchOptions);
      
      // Handle 401 Unauthorized
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Authentication required. Please configure API key.');
      }
      
      // Handle 429 Rate Limit
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        const retryAfter = response.headers.get('Retry-After') || errorData.retryAfter || 60;
        throw new Error(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
      }
      
      return response;
    } catch (error) {
      if (error.message.includes('Authentication required')) {
        console.error('❌ API Authentication Error:', error.message);
        console.error('💡 To fix: Set your API key in localStorage:');
        console.error('   localStorage.setItem("nseMarketMoodApiKey", "your-api-key")');
      }
      throw error;
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

// Create singleton instance
const apiConfig = new ApiConfig();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = apiConfig;
}
