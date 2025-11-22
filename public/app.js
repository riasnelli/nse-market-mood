class MarketMoodApp {
    constructor() {
        this.timerId = null;
        this.lastMarketStatus = null; // Store last known market status
        this.lastSuccessfulStatus = null; // Store last successful market status
        this.consecutiveFailures = 0; // Track consecutive API failures
        this.maxFailures = 3; // Max failures before marking market as closed
        this.updateApiUrl();
        this.init();
    }

    updateApiUrl() {
        // Get API provider from settings
        if (window.settingsManager) {
            const provider = window.settingsManager.getApiProvider();
            this.apiUrl = provider === 'dhan' ? '/api/dhan-data' : '/api/nse-data';
        } else {
            this.apiUrl = '/api/nse-data';
        }
    }

    getApiCredentials() {
        // Get credentials for the active API
        if (window.settingsManager) {
            const apiConfig = window.settingsManager.getActiveApiConfig();
            if (apiConfig.type === 'dhan') {
                return {
                    clientId: apiConfig.config.clientId,
                    accessToken: apiConfig.config.accessToken,
                    apiKey: apiConfig.config.apiKey,
                    apiSecret: apiConfig.config.apiSecret,
                    customEndpoint: apiConfig.config.customEndpoint
                };
            }
        }
        return null;
    }

    reloadWithNewAPI() {
        // Stop current polling
        this.stopPolling();
        // Update API URL
        this.updateApiUrl();
        
        // Check if the selected API is actually working
        if (window.settingsManager) {
            const apiConfig = window.settingsManager.getActiveApiConfig();
            if (apiConfig && apiConfig.type === 'dhan' && apiConfig.testStatus === 'failed') {
                // Dhan API failed - show warning and fallback to NSE
                console.warn('Dhan API test failed, but user saved anyway. Attempting to use it...');
                // Still try to load, but it will likely fail and show mock data
            }
        }
        
        // Reload data with new API
        this.loadData().then(() => {
            // Restart polling if market is open
            if (this.lastMarketStatus && this.lastMarketStatus.isOpen) {
                this.startPolling();
            }
        });
    }

    init() {
        this.updateTimeEl = document.getElementById('updateTime');
        this.refreshBtn = document.getElementById('refreshBtn');

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.handleManualRefresh());
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // When tab becomes visible again, fetch data to check market status
                this.loadData().then(() => {
                    // After loading, check market status from API response
                    if (this.lastMarketStatus && this.lastMarketStatus.isOpen) {
                        this.startPolling();
                    } else {
                        this.stopPolling();
                    }
                });
            }
        });

        this.loadData().then(() => {
            // After initial load, check market status and start/stop polling accordingly
            if (this.lastMarketStatus && this.lastMarketStatus.isOpen) {
                this.startPolling();
            } else {
                this.stopPolling();
            }
        });
    }

    async loadData(retryCount = 0) {
        const maxRetries = 2; // Retry up to 2 times on failure
        
        try {
            this.setLoading(true);
            console.log('Fetching from:', this.apiUrl);

            // Get API provider and credentials
            let requestOptions = {};
            const credentials = this.getApiCredentials();
            if (credentials && credentials.accessToken) {
                // Send credentials for Dhan API
                requestOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(credentials)
                };
            }

            const response = await fetch(this.apiUrl, requestOptions);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Data received:', data);
            
            // Check for API errors (especially Dhan API)
            if (data.error) {
                console.error('API returned error:', data.message || data.error);
                // Log debug info if available
                if (data.debug) {
                    console.error('=== Dhan API Debug Info ===');
                    console.error('Raw response type:', data.debug.rawResponse?.type);
                    console.error('Is array:', data.debug.rawResponse?.isArray);
                    console.error('Response keys:', data.debug.rawResponse?.keys);
                    console.error('Raw response sample:', data.debug.rawResponse?.sample || data.debug.receivedData?.sample);
                    console.error('Full debug:', data.debug);
                }
                throw new Error(data.message || 'API returned an error');
            }
            
            // Check if we got valid data
            const hasValidData = data.indices && data.indices.length > 0;
            console.log(`Valid data: ${hasValidData}, Indices count: ${data.indices?.length || 0}`);
            
            // Store market status from API response
            if (data.marketStatus) {
                // Only update status if we have valid data or if it's explicitly marked as closed
                if (hasValidData || (data.marketStatus.verified && !data.marketStatus.isOpen)) {
                    this.lastMarketStatus = data.marketStatus;
                    this.lastSuccessfulStatus = data.marketStatus;
                    this.consecutiveFailures = 0; // Reset failure counter on success
                    console.log('Market status from API:', this.lastMarketStatus);
                } else {
                    // Invalid data but API responded - might be transient error
                    console.warn(`API responded but no valid data (${this.consecutiveFailures + 1}/${this.maxFailures} failures). Keeping last known status.`);
                    this.consecutiveFailures++;
                    
                    // Use last successful status if available
                    if (this.lastSuccessfulStatus) {
                        this.lastMarketStatus = { ...this.lastSuccessfulStatus };
                        // Mark as potentially closed only after multiple failures
                        if (this.consecutiveFailures >= this.maxFailures) {
                            this.lastMarketStatus.isOpen = false;
                            this.lastMarketStatus.verified = false;
                            this.lastMarketStatus.reason = 'MULTIPLE_FAILURES';
                        }
                    } else {
                        // No previous status - mark as error
                        this.lastMarketStatus = {
                            isOpen: false,
                            verified: false,
                            reason: 'NO_DATA',
                            timestamp: new Date().toISOString()
                        };
                    }
                }
            }
            
            // Only update UI if we have valid data
            if (hasValidData) {
                this.updateUI(data);
            } else if (this.lastSuccessfulStatus && this.lastSuccessfulStatus.isOpen) {
                // Keep showing last successful data if market was open
                console.log('No new data, but market was open - keeping last data visible');
            } else {
                // Check if Dhan API is active - don't show mock data for Dhan errors
                const activeApi = window.settingsManager?.settings?.activeApi;
                if (activeApi === 'dhan') {
                    console.error('Dhan API returned no valid data. Check console for debug info.');
                    // Don't show mock data - show error instead
                    return;
                }
                // Use mock data as fallback only for NSE API
                this.useMockData();
            }
            
            // Update timestamp
            this.updateLastUpdated(new Date());

        } catch (error) {
            console.error(`Error fetching data (attempt ${retryCount + 1}):`, error);
            this.consecutiveFailures++;
            
            // Retry on transient errors
            if (retryCount < maxRetries && (error.message.includes('fetch') || error.message.includes('network'))) {
                console.log(`Retrying in 2 seconds... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                return this.loadData(retryCount + 1);
            }
            
            console.log(`Failed after ${retryCount + 1} attempts. Consecutive failures: ${this.consecutiveFailures}/${this.maxFailures}`);
            
            // After max failures, mark as closed
            if (this.consecutiveFailures >= this.maxFailures) {
                if (this.lastSuccessfulStatus) {
                    this.lastMarketStatus = {
                        ...this.lastSuccessfulStatus,
                        isOpen: false,
                        verified: false,
                        reason: 'MULTIPLE_FAILURES'
                    };
                } else {
                    this.lastMarketStatus = {
                        isOpen: false,
                        verified: false,
                        reason: 'API_ERROR',
                        timestamp: new Date().toISOString()
                    };
                }
            } else {
                // Keep last known status for transient failures
                if (this.lastSuccessfulStatus) {
                    this.lastMarketStatus = { ...this.lastSuccessfulStatus };
                }
            }
            
            // Check if Dhan API is active - don't show mock data for Dhan errors
            const activeApi = window.settingsManager?.settings?.activeApi;
            if (activeApi === 'dhan') {
                console.error('Dhan API error - not using mock data. Error:', error.message);
                // Show error in UI instead of mock data
                this.showErrorInUI('Dhan API Error: ' + error.message);
                return;
            }
            
            // Use mock data as fallback only for NSE API
            this.useMockData();
            // Update timestamp on error
            this.updateLastUpdated(new Date());
        } finally {
            this.setLoading(false);
        }
    }

    useMockData() {
        console.log('Using mock data as fallback');
        const mockData = {
            mood: { score: 65, text: 'Bullish 😊', emoji: '😊' },
            indices: [
                { symbol: 'NIFTY 50', lastPrice: 21500.45, change: 125.50, pChange: 0.59, advances: 28, declines: 17 },
                { symbol: 'NIFTY BANK', lastPrice: 47500.75, change: 280.25, pChange: 0.59, advances: 0, declines: 0 },
                { symbol: 'NIFTY IT', lastPrice: 35000.25, change: 150.30, pChange: 0.43, advances: 0, declines: 0 }
            ],
            vix: { last: 14.25, change: -0.35, pChange: -2.40 },
            advanceDecline: { advances: 28, declines: 17 },
            note: 'Mock Data'
        };
        this.updateUI(mockData);
    }

    showErrorInUI(errorMessage) {
        console.error('Showing error in UI:', errorMessage);
        // Clear existing data
        const mainGrid = document.getElementById('mainIndicesGrid');
        const allIndicesGrid = document.getElementById('allIndicesGrid');
        if (mainGrid) mainGrid.innerHTML = '';
        if (allIndicesGrid) allIndicesGrid.innerHTML = '';
        
        // Show error message
        const moodCard = document.getElementById('moodCard');
        if (moodCard) {
            const moodText = document.getElementById('moodText');
            const moodEmoji = document.getElementById('moodEmoji');
            if (moodText) moodText.textContent = 'Error Loading Data';
            if (moodEmoji) moodEmoji.textContent = '❌';
            
            // Add error details
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'margin-top: 20px; padding: 15px; background: #fee; border: 1px solid #fcc; border-radius: 8px; color: #c33; font-size: 0.9rem;';
            errorDiv.textContent = errorMessage;
            moodCard.appendChild(errorDiv);
        }
        
        // Update score to show error
        const scoreText = document.getElementById('scoreText');
        if (scoreText) scoreText.textContent = 'Error';
        const scoreFill = document.getElementById('scoreFill');
        if (scoreFill) scoreFill.style.width = '0%';
    }

    startPolling() {
        // Check market status from API response (more reliable than time-based)
        if (this.lastMarketStatus && !this.lastMarketStatus.isOpen) {
            console.log('Market is closed (from API) - not starting polling');
            this.stopPolling();
            return;
        }

        const interval = 30_000; // 30s during market hours

        if (this.timerId) {
            clearInterval(this.timerId);
        }

        console.log('Starting auto-polling (30s interval)');

        this.timerId = setInterval(() => {
            // Check market status before each fetch
            // We'll check again after loadData() updates lastMarketStatus
            this.loadData().then(() => {
                // After loading, check if market is still open
                // Only stop polling after multiple consecutive failures
                if (this.lastMarketStatus && 
                    !this.lastMarketStatus.isOpen && 
                    this.consecutiveFailures >= this.maxFailures) {
                    // Market closed after multiple failures - stop polling
                    this.stopPolling();
                    console.log('Market closed (multiple failures) - stopped auto-polling');
                } else if (this.lastMarketStatus && 
                          !this.lastMarketStatus.isOpen && 
                          this.lastMarketStatus.verified && 
                          this.lastMarketStatus.reason !== 'MULTIPLE_FAILURES' &&
                          this.lastMarketStatus.reason !== 'API_ERROR') {
                    // Market explicitly closed (not due to API errors) - stop polling
                    this.stopPolling();
                    console.log('Market closed (verified) - stopped auto-polling');
                }
                // Otherwise, continue polling even if there's a transient error
            });
        }, interval);
    }

    stopPolling() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    handleManualRefresh() {
        // Manual refresh always works, regardless of market status
        // This allows users to refresh even when market is closed
        this.loadData();
    }

    isMarketOpen() {
        // Prefer API-based market status over time-based check
        if (this.lastMarketStatus) {
            return this.lastMarketStatus.isOpen;
        }
        
        // Fallback to time-based check if no API status available
        // NSE market hours: 09:15 to 15:30 IST (India Standard Time, UTC+5:30)
        const now = new Date();
        // convert to milliseconds and get IST time components
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istOffset = 5.5 * 60 * 60000; // +5:30
        const ist = new Date(utc + istOffset);

        const hours = ist.getHours();
        const minutes = ist.getMinutes();

        const afterOpen = (hours > 9) || (hours === 9 && minutes >= 15);
        const beforeClose = (hours < 15) || (hours === 15 && minutes <= 30);

        return afterOpen && beforeClose;
    }

    updateLastUpdated(date) {
        if (!this.updateTimeEl) return;
        // Format time in IST with AM/PM and seconds
        try {
            const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
            const formatted = new Intl.DateTimeFormat('en-US', opts).format(date);
            this.updateTimeEl.textContent = formatted;
        } catch (e) {
            // Fallback: use local time formatted
            this.updateTimeEl.textContent = date.toLocaleTimeString();
        }
    }

    updateUI(data) {
        // Update mood
        const moodEmoji = document.getElementById('moodEmoji');
        const moodText = document.getElementById('moodText');
        const scoreFill = document.getElementById('scoreFill');
        const scoreText = document.getElementById('scoreText');

        if (data.mood) {
            if (moodEmoji) moodEmoji.textContent = data.mood.emoji || '😐';
            if (moodText) moodText.textContent = data.mood.text || '';
            if (scoreFill && typeof data.mood.score === 'number') {
                const pct = Math.max(0, Math.min(100, data.mood.score));
                scoreFill.style.width = pct + '%';
            }
            if (scoreText) scoreText.textContent = (data.mood.score != null) ? `${data.mood.score}/100` : '-/-';
            
            // Update background color based on mood score
            this.updateBackgroundColor(data.mood.score);
        }

        // Update indices display
        this.updateIndices(data.indices || [], data.vix);

        // Advance/Decline
        const adv = document.getElementById('advances');
        const dec = document.getElementById('declines');
        if (adv) adv.textContent = (data.advanceDecline && data.advanceDecline.advances != null) ? data.advanceDecline.advances : '-';
        if (dec) dec.textContent = (data.advanceDecline && data.advanceDecline.declines != null) ? data.advanceDecline.declines : '-';
    }

    updateIndices(indices, vix) {
        // Main indices to show prominently
        const mainIndices = ['NIFTY 50', 'NIFTY BANK'];
        const mainGrid = document.getElementById('mainIndicesGrid');
        const allIndicesGrid = document.getElementById('allIndicesGrid');
        const allIndicesSection = document.getElementById('allIndicesSection');
        
        if (!mainGrid) return;

        // Clear existing content
        mainGrid.innerHTML = '';
        if (allIndicesGrid) allIndicesGrid.innerHTML = '';

        // Display main indices
        mainIndices.forEach(symbol => {
            const index = indices.find(idx => idx.symbol === symbol);
            if (index) {
                mainGrid.appendChild(this.createIndexCard(index));
            }
        });

        // Display VIX
        if (vix) {
            mainGrid.appendChild(this.createIndexCard({
                symbol: 'INDIA VIX',
                lastPrice: vix.last,
                change: vix.change,
                pChange: vix.pChange
            }));
        }

        // Display all other indices
        const otherIndices = indices.filter(idx => !mainIndices.includes(idx.symbol));
        if (otherIndices.length > 0 && allIndicesGrid && allIndicesSection) {
            otherIndices.forEach(index => {
                allIndicesGrid.appendChild(this.createIndexCard(index));
            });
            allIndicesSection.style.display = 'block';
        } else if (allIndicesSection) {
            allIndicesSection.style.display = 'none';
        }
    }

    createIndexCard(index) {
        const card = document.createElement('div');
        card.className = 'data-card';
        
        const title = document.createElement('h3');
        title.textContent = index.symbol;
        card.appendChild(title);
        
        const value = document.createElement('div');
        value.className = 'data-value';
        if (index.lastPrice != null) {
            value.textContent = typeof index.lastPrice === 'number' ? index.lastPrice.toFixed(2) : index.lastPrice;
        } else {
            value.textContent = '-';
        }
        card.appendChild(value);
        
        const change = document.createElement('div');
        change.className = 'data-change';
        if (index.change != null && index.pChange != null) {
            const changeVal = typeof index.change === 'number' ? index.change.toFixed(2) : index.change;
            const pChangeVal = typeof index.pChange === 'number' ? index.pChange.toFixed(2) : index.pChange;
            const sign = index.change >= 0 ? '+' : '';
            change.textContent = `${sign}${changeVal} (${sign}${pChangeVal}%)`;
            
            // Add color classes
            if (index.change > 0) {
                change.classList.add('positive');
            } else if (index.change < 0) {
                change.classList.add('negative');
            }
        } else {
            change.textContent = '-';
        }
        card.appendChild(change);
        
        return card;
    }

    updateBackgroundColor(score) {
        // Update body background based on mood score
        const body = document.body;
        if (!body) return;

        let gradient;
        if (score >= 70) {
            // Very Bullish - Green gradient
            gradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else if (score >= 60) {
            // Bullish - Light green gradient
            gradient = 'linear-gradient(135deg, #34d399 0%, #10b981 100%)';
        } else if (score >= 50) {
            // Slightly Bullish - Yellow/Green gradient
            gradient = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
        } else if (score >= 40) {
            // Neutral - Orange gradient
            gradient = 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
        } else if (score >= 30) {
            // Slightly Bearish - Orange/Red gradient
            gradient = 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)';
        } else if (score >= 20) {
            // Bearish - Red gradient
            gradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        } else {
            // Very Bearish - Dark red gradient
            gradient = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
        }

        body.style.background = gradient;
    }

    setLoading(isLoading) {
        if (this.refreshBtn) {
            this.refreshBtn.disabled = isLoading;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.marketMoodApp = new MarketMoodApp();
});