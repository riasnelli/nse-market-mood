class MarketMoodApp {
    constructor() {
        this.timerId = null;
        this.lastMarketStatus = null; // Store last known market status
        this.lastSuccessfulStatus = null; // Store last successful market status
        this.consecutiveFailures = 0; // Track consecutive API failures
        this.maxFailures = 3; // Max failures before marking market as closed
        this.viewMode = 'card'; // 'card' or 'table' for all indices view
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
        this.settingsBtn = document.getElementById('settingsBtn');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.logoutBtn = document.getElementById('logoutBtn');

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.handleManualRefresh());
        }
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => window.settingsManager?.openSettings());
        }
        if (this.uploadBtn) {
            this.uploadBtn.addEventListener('click', () => this.openUploadModal());
        }
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Show/hide logout button based on login status
        this.updateLogoutButton();

        // Setup view toggle buttons
        this.cardViewBtn = document.getElementById('cardViewBtn');
        this.tableViewBtn = document.getElementById('tableViewBtn');
        
        if (this.cardViewBtn) {
            this.cardViewBtn.addEventListener('click', () => this.switchView('card'));
        }
        
        if (this.tableViewBtn) {
            this.tableViewBtn.addEventListener('click', () => this.switchView('table'));
        }

        // Load saved view preference
        const savedView = localStorage.getItem('indicesViewMode');
        if (savedView === 'table' || savedView === 'card') {
            this.viewMode = savedView;
            this.updateViewToggleButtons();
        }

        // Setup upload functionality
        this.setupUpload();

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
        
        // Check if uploaded data is selected as active API
        const activeApi = window.settingsManager?.settings?.activeApi;
        if (activeApi === 'uploaded') {
            const uploadedData = this.getUploadedData();
            if (uploadedData && uploadedData.indices && uploadedData.indices.length > 0) {
                console.log('Using uploaded CSV data (selected as active source)');
                this.updateDataSourceDisplay('uploaded', uploadedData);
                this.updateUI(uploadedData);
                this.setLoading(false);
                this.lastSuccessfulStatus = uploadedData;
                return;
            } else {
                console.warn('Uploaded data selected but no data found. Falling back to API.');
                // Fall through to API data
            }
        }
        
        // Update data source display for API
        this.updateDataSourceDisplay('api');
        
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

            // Add cache-busting and ensure fresh data
            const cacheBuster = `?t=${Date.now()}`;
            const apiUrlWithCacheBust = this.apiUrl + (this.apiUrl.includes('?') ? '&' : '?') + `_=${Date.now()}`;
            
            // Use fetch with no-cache headers
            const fetchOptions = {
                ...requestOptions,
                cache: 'no-store',
                headers: {
                    ...(requestOptions.headers || {}),
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            };
            
            const response = await fetch(apiUrlWithCacheBust, fetchOptions);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Data received:', data);
            
            // Check for API errors (especially Dhan API)
            if (data.error) {
                console.error('❌ API returned error:', data.message || data.error);
                // Log debug info if available
                if (data.debug) {
                    console.group('🔍 Dhan API Debug Info');
                    console.error('Raw response type:', data.debug.rawResponse?.type);
                    console.error('Is array:', data.debug.rawResponse?.isArray);
                    console.error('Response keys:', data.debug.rawResponse?.keys);
                    console.error('Raw response sample:', data.debug.rawResponse?.sample || data.debug.receivedData?.sample);
                    
                    // Show full structure in a more accessible way
                    if (data.debug.fullStructure) {
                        console.error('📋 Full Response Structure:');
                        try {
                            const parsed = JSON.parse(data.debug.fullStructure);
                            console.error(parsed);
                            console.error('📋 Full Structure (JSON):', data.debug.fullStructure);
                        } catch (e) {
                            console.error('📋 Full Structure (raw):', data.debug.fullStructure);
                        }
                    } else {
                        console.error('📋 Full Debug Object:', JSON.stringify(data.debug, null, 2));
                    }
                    
                    // Try to parse the response ourselves if we have the raw data
                    if (data.debug.rawResponse?.sample) {
                        try {
                            const rawData = JSON.parse(data.debug.rawResponse.sample);
                            console.error('✅ Parsed raw data structure:', rawData);
                            console.error('✅ Parsed data keys:', Object.keys(rawData || {}));
                        } catch (e) {
                            console.error('⚠️ Could not parse raw response sample');
                        }
                    }
                    console.groupEnd();
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
                console.log('Updating UI with fresh data from API');
                // Update data source display for API
                this.updateDataSourceDisplay('api');
                this.updateUI(data);
            } else {
                console.warn('No valid data received from API');
                // Update data source display for API
                this.updateDataSourceDisplay('api');
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
            
            // Check if Dhan API is active - don't show mock data for Dhan errors
            const activeApi = window.settingsManager?.settings?.activeApi;
            if (activeApi === 'dhan') {
                console.error('Dhan API error - not using mock data. Error:', error.message);
                // Show error in UI instead of mock data
                this.showErrorInUI('Dhan API Error: ' + error.message);
                return;
            }
            
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
        // Main indices: Always show these 4 in cards under mood box
        // First row: NIFTY 50, NIFTY BANK
        // Second row: NIFTY IT, INDIA VIX
        const mainIndicesSymbols = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'INDIA VIX'];
        const mainGrid = document.getElementById('mainIndicesGrid');
        const allIndicesGrid = document.getElementById('allIndicesGrid');
        const allIndicesSection = document.getElementById('allIndicesSection');
        
        if (!mainGrid) return;

        // Clear existing content
        mainGrid.innerHTML = '';
        if (allIndicesGrid) allIndicesGrid.innerHTML = '';

        // Display main indices: NIFTY 50, NIFTY BANK, NIFTY IT, INDIA VIX
        // Helper function to find index by flexible matching (case-insensitive, handles variations)
        const findIndex = (indices, searchTerms) => {
            return indices.find(idx => {
                const symbolUpper = idx.symbol.toUpperCase().trim();
                return searchTerms.some(term => {
                    const termUpper = term.toUpperCase().trim();
                    // Exact match
                    if (symbolUpper === termUpper) return true;
                    
                    // Special handling for NIFTY 50 - must be exactly "NIFTY 50" or "NIFTY50", not "NIFTY 500" or "NIFTY 50 Equal Weight"
                    if (termUpper === 'NIFTY 50' || termUpper === 'NIFTY50') {
                        return symbolUpper === 'NIFTY 50' || symbolUpper === 'NIFTY50' || 
                               symbolUpper === 'NIFTY 50' || symbolUpper === 'NIFTY 50';
                    }
                    
                    // Special handling for NIFTY BANK - must be exactly "NIFTY BANK", not "NIFTY PSU BANK" or "NIFTY PRIVATE BANK"
                    if (termUpper === 'NIFTY BANK' || termUpper === 'NIFTYBANK') {
                        return symbolUpper === 'NIFTY BANK' || symbolUpper === 'NIFTYBANK' ||
                               (symbolUpper.startsWith('NIFTY') && symbolUpper.endsWith('BANK') && 
                                symbolUpper.length <= 11); // "NIFTY BANK" is 10 chars
                    }
                    
                    // Special handling for NIFTY IT
                    if (termUpper === 'NIFTY IT' || termUpper === 'NIFTYIT') {
                        return symbolUpper === 'NIFTY IT' || symbolUpper === 'NIFTYIT';
                    }
                    
                    return symbolUpper.includes(termUpper);
                });
            });
        };

        // First row: NIFTY 50, NIFTY BANK
        const nifty50 = findIndex(indices, ['NIFTY 50', 'Nifty 50', 'Nifty50']);
        const niftyBank = findIndex(indices, ['NIFTY BANK', 'Nifty Bank', 'NiftyBank']);
        
        if (nifty50) {
            mainGrid.appendChild(this.createIndexCard(nifty50));
        } else {
            console.warn('NIFTY 50 not found in indices');
        }
        if (niftyBank) {
            mainGrid.appendChild(this.createIndexCard(niftyBank));
        } else {
            console.warn('NIFTY BANK not found in indices');
        }

        // Second row: NIFTY IT, INDIA VIX
        const niftyIT = findIndex(indices, ['NIFTY IT', 'Nifty IT', 'NIFTYIT']);
        if (niftyIT) {
            mainGrid.appendChild(this.createIndexCard(niftyIT));
        } else {
            console.warn('NIFTY IT not found in indices');
        }

        // Add VIX (from vix parameter or from indices array)
        let vixData = vix;
        if (!vixData) {
            const vixFromIndices = indices.find(idx => 
                idx.symbol.toUpperCase().includes('VIX') || 
                idx.symbol.toUpperCase() === 'INDIA VIX'
            );
            if (vixFromIndices) {
                vixData = {
                    last: vixFromIndices.lastPrice,
                    change: vixFromIndices.change,
                    pChange: vixFromIndices.pChange
                };
            }
        }
        
        if (vixData) {
            mainGrid.appendChild(this.createIndexCard({
                symbol: 'INDIA VIX',
                lastPrice: vixData.last,
                change: vixData.change,
                pChange: vixData.pChange
            }));
        }

        // Display all other indices (excluding the 4 main ones)
        // Create a set of main index symbols for efficient lookup
        const mainIndexSymbols = new Set();
        if (nifty50) mainIndexSymbols.add(nifty50.symbol.toUpperCase());
        if (niftyBank) mainIndexSymbols.add(niftyBank.symbol.toUpperCase());
        if (niftyIT) mainIndexSymbols.add(niftyIT.symbol.toUpperCase());
        if (vixData) mainIndexSymbols.add('INDIA VIX');
        
        const otherIndices = indices.filter(idx => {
            const idxSymbolUpper = idx.symbol.toUpperCase();
            // Exclude exact matches with main indices
            if (mainIndexSymbols.has(idxSymbolUpper)) return false;
            // Also exclude VIX variations if VIX is in main indices
            if (vixData && (idxSymbolUpper === 'INDIA VIX' || idxSymbolUpper.includes('VIX'))) return false;
            return true;
        });
        
        // Sort other indices by percentage change: highest gain first, then highest loss
        const sortedOtherIndices = [...otherIndices].sort((a, b) => {
            const aPChange = a.pChange != null ? (typeof a.pChange === 'number' ? a.pChange : parseFloat(a.pChange) || 0) : 0;
            const bPChange = b.pChange != null ? (typeof b.pChange === 'number' ? b.pChange : parseFloat(b.pChange) || 0) : 0;
            
            // Separate positive and negative
            const aIsPositive = aPChange > 0;
            const bIsPositive = bPChange > 0;
            
            // If one is positive and one is negative, positive comes first
            if (aIsPositive && !bIsPositive) return -1;
            if (!aIsPositive && bIsPositive) return 1;
            
            // Both positive: sort descending by % (highest % first)
            if (aIsPositive && bIsPositive) {
                return bPChange - aPChange;
            }
            
            // Both negative: sort ascending by % (most negative % first, i.e., -5% comes before -2%)
            return aPChange - bPChange;
        });
        
        if (sortedOtherIndices.length > 0 && allIndicesSection) {
            allIndicesSection.style.display = 'block';
            
            // Render based on current view mode
            if (this.viewMode === 'table') {
                this.renderIndicesTable(sortedOtherIndices);
            } else {
                this.renderIndicesCards(sortedOtherIndices);
            }
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

    renderIndicesCards(indices) {
        const allIndicesGrid = document.getElementById('allIndicesGrid');
        const tableContainer = document.getElementById('tableContainer');
        
        if (!allIndicesGrid) return;
        
        // Show grid, hide table
        allIndicesGrid.style.display = 'grid';
        if (tableContainer) tableContainer.style.display = 'none';
        
        // Clear and populate grid
        allIndicesGrid.innerHTML = '';
        indices.forEach(index => {
            allIndicesGrid.appendChild(this.createIndexCard(index));
        });
    }

    renderIndicesTable(indices) {
        const allIndicesGrid = document.getElementById('allIndicesGrid');
        const tableContainer = document.getElementById('tableContainer');
        const tableBody = document.getElementById('indicesTableBody');
        
        if (!tableContainer || !tableBody) return;
        
        // Hide grid, show table
        if (allIndicesGrid) allIndicesGrid.style.display = 'none';
        tableContainer.style.display = 'block';
        
        // Sort indices: green (positive) first by highest % change, then red (negative) by highest loss %
        const sortedIndices = [...indices].sort((a, b) => {
            const aPChange = a.pChange != null ? (typeof a.pChange === 'number' ? a.pChange : parseFloat(a.pChange) || 0) : 0;
            const bPChange = b.pChange != null ? (typeof b.pChange === 'number' ? b.pChange : parseFloat(b.pChange) || 0) : 0;
            
            // Separate positive and negative
            const aIsPositive = aPChange > 0;
            const bIsPositive = bPChange > 0;
            
            // If one is positive and one is negative, positive comes first
            if (aIsPositive && !bIsPositive) return -1;
            if (!aIsPositive && bIsPositive) return 1;
            
            // Both positive: sort descending by % (highest % first)
            if (aIsPositive && bIsPositive) {
                return bPChange - aPChange;
            }
            
            // Both negative: sort ascending by % (most negative % first, i.e., -5% comes before -2%)
            return aPChange - bPChange;
        });
        
        // Clear and populate table
        tableBody.innerHTML = '';
        sortedIndices.forEach((index, indexNum) => {
            const row = document.createElement('tr');
            
            // Row number
            const rowNumCell = document.createElement('td');
            rowNumCell.className = 'row-number';
            rowNumCell.textContent = indexNum + 1;
            row.appendChild(rowNumCell);
            
            // Index name - remove "NIFTY" prefix
            const nameCell = document.createElement('td');
            nameCell.className = 'index-name';
            let indexName = index.symbol || '';
            const originalIndexName = indexName; // Keep original for tooltip
            // Remove "NIFTY" prefix if present
            if (indexName.toUpperCase().startsWith('NIFTY ')) {
                indexName = indexName.substring(6); // Remove "NIFTY "
            }
            nameCell.textContent = indexName;
            // Add tooltip with full name if different
            if (originalIndexName !== indexName || indexName.length > 15) {
                nameCell.title = originalIndexName;
            }
            row.appendChild(nameCell);
            
            // Value
            const valueCell = document.createElement('td');
            valueCell.className = 'index-value';
            let valueText = '-';
            if (index.lastPrice != null) {
                valueText = typeof index.lastPrice === 'number' ? index.lastPrice.toFixed(2) : index.lastPrice;
            }
            valueCell.textContent = valueText;
            valueCell.title = valueText; // Tooltip for full value
            row.appendChild(valueCell);
            
            // Change and % Change combined in one cell
            const changeCell = document.createElement('td');
            changeCell.className = 'index-change';
            let changeText = '-';
            if (index.change != null && index.pChange != null) {
                const changeVal = typeof index.change === 'number' ? index.change.toFixed(2) : index.change;
                const pChangeVal = typeof index.pChange === 'number' ? index.pChange.toFixed(2) : index.pChange;
                const sign = index.change >= 0 ? '+' : '';
                changeText = `${sign}${changeVal} (${sign}${pChangeVal}%)`;
                changeCell.textContent = changeText;
                changeCell.title = changeText; // Tooltip for full change value
                
                if (index.change > 0) {
                    changeCell.classList.add('positive');
                } else if (index.change < 0) {
                    changeCell.classList.add('negative');
                }
            } else {
                changeCell.textContent = changeText;
            }
            row.appendChild(changeCell);
            
            tableBody.appendChild(row);
        });
    }

    switchView(mode) {
        if (mode !== 'card' && mode !== 'table') return;
        
        this.viewMode = mode;
        localStorage.setItem('indicesViewMode', mode);
        this.updateViewToggleButtons();
        
        // Re-render indices with new view mode
        const allIndicesSection = document.getElementById('allIndicesSection');
        if (allIndicesSection && allIndicesSection.style.display !== 'none') {
            // Get current indices data from the last successful load
            if (this.lastSuccessfulStatus && this.lastSuccessfulStatus.indices) {
                const mainIndicesSymbols = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'INDIA VIX'];
                const otherIndices = this.lastSuccessfulStatus.indices.filter(idx => {
                    const symbol = idx.symbol.toUpperCase();
                    return !mainIndicesSymbols.some(main => symbol === main.toUpperCase() || symbol.includes('VIX'));
                });
                
                // Sort by percentage change: highest gain first, then highest loss
                const sortedOtherIndices = [...otherIndices].sort((a, b) => {
                    const aPChange = a.pChange != null ? (typeof a.pChange === 'number' ? a.pChange : parseFloat(a.pChange) || 0) : 0;
                    const bPChange = b.pChange != null ? (typeof b.pChange === 'number' ? b.pChange : parseFloat(b.pChange) || 0) : 0;
                    
                    const aIsPositive = aPChange > 0;
                    const bIsPositive = bPChange > 0;
                    
                    if (aIsPositive && !bIsPositive) return -1;
                    if (!aIsPositive && bIsPositive) return 1;
                    
                    if (aIsPositive && bIsPositive) {
                        return bPChange - aPChange;
                    }
                    
                    return aPChange - bPChange;
                });
                
                if (sortedOtherIndices.length > 0) {
                    if (mode === 'table') {
                        this.renderIndicesTable(sortedOtherIndices);
                    } else {
                        this.renderIndicesCards(sortedOtherIndices);
                    }
                }
            }
        }
    }

    updateViewToggleButtons() {
        if (this.cardViewBtn && this.tableViewBtn) {
            if (this.viewMode === 'card') {
                this.cardViewBtn.classList.add('active');
                this.tableViewBtn.classList.remove('active');
            } else {
                this.tableViewBtn.classList.add('active');
                this.cardViewBtn.classList.remove('active');
            }
        }
    }

    updateBackgroundColor(score) {
        // Update body background based on mood score
        const body = document.body;
        if (!body) return;

        let gradient;
        let themeColor; // Primary color for PWA theme-color
        
        if (score >= 70) {
            // Very Bullish - Green gradient
            gradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            themeColor = '#10b981'; // Primary green
        } else if (score >= 60) {
            // Bullish - Light green gradient
            gradient = 'linear-gradient(135deg, #34d399 0%, #10b981 100%)';
            themeColor = '#34d399'; // Light green
        } else if (score >= 50) {
            // Slightly Bullish - Yellow/Green gradient
            gradient = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
            themeColor = '#fbbf24'; // Yellow
        } else if (score >= 40) {
            // Neutral - Orange gradient
            gradient = 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
            themeColor = '#f97316'; // Orange
        } else if (score >= 30) {
            // Slightly Bearish - Orange/Red gradient
            gradient = 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)';
            themeColor = '#fb923c'; // Orange-red
        } else if (score >= 20) {
            // Bearish - Red gradient
            gradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
            themeColor = '#ef4444'; // Red
        } else {
            // Very Bearish - Dark red gradient
            gradient = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
            themeColor = '#dc2626'; // Dark red
        }

        body.style.background = gradient;
        
        // Update PWA theme-color meta tag for mobile browser inset
        this.updateThemeColor(themeColor);
    }

    updateThemeColor(color) {
        // Update or create theme-color meta tag
        let themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeColorMeta) {
            themeColorMeta = document.createElement('meta');
            themeColorMeta.setAttribute('name', 'theme-color');
            document.head.appendChild(themeColorMeta);
        }
        themeColorMeta.setAttribute('content', color);
    }

    setLoading(isLoading) {
        if (this.refreshBtn) {
            this.refreshBtn.disabled = isLoading;
        }
    }

    setupUpload() {
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadModal = document.getElementById('uploadModal');
        const closeUpload = document.getElementById('closeUpload');
        const cancelUpload = document.getElementById('cancelUpload');
        const csvFile = document.getElementById('csvFile');
        const dataDate = document.getElementById('dataDate');
        const uploadDataBtn = document.getElementById('uploadDataBtn');
        const fileName = document.getElementById('fileName');
        const clearUploadBtn = document.getElementById('clearUploadBtn');

        // Set today's date as default
        if (dataDate) {
            const today = new Date().toISOString().split('T')[0];
            dataDate.value = today;
        }

        // Open upload modal
        if (uploadBtn && uploadModal) {
            uploadBtn.addEventListener('click', () => {
                uploadModal.classList.add('show');
                this.updateUploadedDataInfo();
            });
        }

        // Close upload modal
        if (closeUpload && uploadModal) {
            closeUpload.addEventListener('click', () => {
                uploadModal.classList.remove('show');
            });
        }

        if (cancelUpload && uploadModal) {
            cancelUpload.addEventListener('click', () => {
                uploadModal.classList.remove('show');
            });
        }

        // File selection
        if (csvFile && fileName) {
            csvFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    fileName.textContent = file.name;
                    if (uploadDataBtn) uploadDataBtn.disabled = false;
                } else {
                    fileName.textContent = 'Choose CSV file...';
                    if (uploadDataBtn) uploadDataBtn.disabled = true;
                }
            });
        }

        // Upload button
        if (uploadDataBtn && csvFile && dataDate) {
            uploadDataBtn.addEventListener('click', () => {
                const file = csvFile.files[0];
                const date = dataDate.value;
                
                if (!file || !date) {
                    this.showUploadStatus('Please select a file and date', 'error');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const csvData = this.parseCSV(e.target.result);
                        const processedData = this.processCSVData(csvData, date, file.name);
                        
                        // Store in localStorage
                        localStorage.setItem('uploadedIndicesData', JSON.stringify(processedData));
                        
                        // Also save to database (optional - will work even if DB is not configured)
                        this.saveToDatabase(processedData, file.name, date).catch(err => {
                            console.warn('Failed to save to database (continuing with localStorage):', err);
                        });
                        
                        this.showUploadStatus('Data uploaded successfully!', 'success');
                        this.updateUploadedDataInfo();
                        
                        // Reload data to use uploaded CSV
                        setTimeout(() => {
                            if (uploadModal) uploadModal.classList.remove('show');
                            this.loadData();
                        }, 1500);
                    } catch (error) {
                        console.error('Error processing CSV:', error);
                        this.showUploadStatus('Error processing CSV: ' + error.message, 'error');
                    }
                };
                reader.readAsText(file);
            });
        }

        // Clear uploaded data
        if (clearUploadBtn) {
            clearUploadBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the uploaded data?')) {
                    localStorage.removeItem('uploadedIndicesData');
                    this.updateUploadedDataInfo();
                    this.updateDataSourceDisplay('api');
                    this.loadData();
                }
            });
        }

        // Update uploaded data info on load
        this.updateUploadedDataInfo();
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV file is empty or invalid');
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index].trim().replace(/^"|"$/g, '');
                });
                data.push(row);
            }
        }

        return data;
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current); // Add last value

        return values;
    }

    processCSVData(csvData, date, fileName) {
        const indices = [];
        let vixData = null;

        csvData.forEach(row => {
            const name = row['Name'] || row['name'] || '';
            const ltp = parseFloat((row['LTP'] || row['ltp'] || '0').replace(/,/g, ''));
            const changePercent = parseFloat((row['Change(%)'] || row['Change (%)'] || row['change'] || '0').replace(/%/g, ''));

            // Skip rows with empty name, but allow 0 values for ltp and changePercent
            if (!name || name.trim() === '') {
                return; // Skip invalid rows
            }
            
            // Allow 0 values, but check if ltp is actually a number
            if (isNaN(ltp) || isNaN(changePercent)) {
                return; // Skip invalid rows
            }

            // Calculate absolute change from percentage
            const prevClose = ltp / (1 + changePercent / 100);
            const change = ltp - prevClose;

            // Normalize symbol name - ensure consistent format
            let normalizedName = name.trim();
            const nameUpper = normalizedName.toUpperCase();
            
            // Standardize common variations - be precise to avoid matching wrong indices
            // Match exactly "Nifty 50" or "NIFTY 50" (case-insensitive, not "Nifty 500" or "Nifty 50 Equal Weight")
            if (nameUpper === 'NIFTY 50' || nameUpper === 'NIFTY50') {
                normalizedName = 'NIFTY 50';
            } 
            // Match exactly "Nifty Bank" or "NIFTY BANK" (case-insensitive, not "Nifty PSU Bank" or "Nifty Private Bank")
            else if (nameUpper === 'NIFTY BANK' || nameUpper === 'NIFTYBANK') {
                normalizedName = 'NIFTY BANK';
            } 
            // Match exactly "NIFTY IT" (case-insensitive)
            else if (nameUpper === 'NIFTY IT' || nameUpper === 'NIFTYIT') {
                normalizedName = 'NIFTY IT';
            } 
            // Match VIX variations
            else if (nameUpper.includes('VIX')) {
                normalizedName = 'INDIA VIX';
            }

            if (normalizedName.toUpperCase().includes('VIX') || normalizedName.toUpperCase() === 'INDIA VIX') {
                vixData = {
                    last: ltp,
                    change: change,
                    pChange: changePercent
                };
            } else {
                indices.push({
                    symbol: normalizedName,
                    lastPrice: ltp,
                    change: change,
                    pChange: changePercent
                });
            }
        });

        // Calculate mood from NIFTY 50
        const nifty50 = indices.find(idx => 
            idx.symbol.toUpperCase().includes('NIFTY 50') || 
            idx.symbol.toUpperCase() === 'NIFTY 50'
        );

        let moodScore = 50;
        if (nifty50) {
            if (nifty50.pChange > 0.5) moodScore += 20;
            else if (nifty50.pChange < -0.5) moodScore -= 20;
            else if (nifty50.pChange > 0.1) moodScore += 10;
            else if (nifty50.pChange < -0.1) moodScore -= 10;
        }

        moodScore = Math.max(0, Math.min(100, moodScore));
        const mood = this.getMoodFromScore(moodScore);

        // Include VIX in indices array if it exists, so total count is correct
        const allIndices = [...indices];
        if (vixData) {
            allIndices.push({
                symbol: 'INDIA VIX',
                lastPrice: vixData.last,
                change: vixData.change,
                pChange: vixData.pChange
            });
        }

        return {
            mood: mood,
            indices: allIndices, // Include VIX in total count
            vix: vixData || { last: 0, change: 0, pChange: 0 },
            advanceDecline: { advances: 0, declines: 0 }, // CSV doesn't have this
            timestamp: new Date(date).toISOString(),
            source: 'uploaded',
            fileName: fileName,
            date: date
        };
    }

    getMoodFromScore(score) {
        if (score >= 80) return { score, text: 'Extremely Bullish', emoji: '🚀' };
        if (score >= 70) return { score, text: 'Very Bullish', emoji: '📈' };
        if (score >= 60) return { score, text: 'Bullish', emoji: '😊' };
        if (score >= 50) return { score, text: 'Slightly Bullish', emoji: '🙂' };
        if (score >= 40) return { score, text: 'Neutral', emoji: '😐' };
        if (score >= 30) return { score, text: 'Slightly Bearish', emoji: '🙁' };
        if (score >= 20) return { score, text: 'Bearish', emoji: '😟' };
        if (score >= 10) return { score, text: 'Very Bearish', emoji: '📉' };
        return { score, text: 'Extremely Bearish', emoji: '🐻' };
    }

    async saveToDatabase(data, fileName, dataDate) {
        try {
            const response = await fetch('/api/save-uploaded-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileName: fileName || 'uploaded.csv',
                    date: dataDate || new Date().toISOString().split('T')[0],
                    indices: data.indices || [],
                    mood: data.mood,
                    vix: data.vix,
                    advanceDecline: data.advanceDecline,
                    timestamp: data.timestamp || new Date().toISOString(),
                    source: data.source || 'uploaded'
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    console.log('✅ Data saved to MongoDB:', result.id);
                    if (result.warning) {
                        console.warn('⚠️', result.warning);
                    }
                } else {
                    console.warn('⚠️ Database save returned:', result);
                }
                return result;
            } else {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errorData.message || `Failed to save: ${response.statusText}`);
            }
        } catch (error) {
            console.error('❌ Error saving to database:', error);
            // Don't throw - allow localStorage to work as fallback
            return { success: false, error: error.message };
        }
    }

    getUploadedData() {
        const stored = localStorage.getItem('uploadedIndicesData');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error('Error parsing uploaded data:', e);
                return null;
            }
        }
        return null;
    }

    updateUploadedDataInfo() {
        const uploadedData = this.getUploadedData();
        const uploadedDataInfo = document.getElementById('uploadedDataInfo');
        const uploadedFileName = document.getElementById('uploadedFileName');
        const uploadedDate = document.getElementById('uploadedDate');
        const uploadedIndicesCount = document.getElementById('uploadedIndicesCount');

        if (uploadedData) {
            if (uploadedDataInfo) uploadedDataInfo.style.display = 'block';
            if (uploadedFileName) uploadedFileName.textContent = uploadedData.fileName || 'Unknown';
            if (uploadedDate) uploadedDate.textContent = uploadedData.date || 'Unknown';
            if (uploadedIndicesCount) uploadedIndicesCount.textContent = uploadedData.indices ? uploadedData.indices.length : 0;
        } else {
            if (uploadedDataInfo) uploadedDataInfo.style.display = 'none';
        }
    }

    showUploadStatus(message, type) {
        const statusEl = document.getElementById('uploadStatus');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = message;
            statusEl.className = `upload-status ${type}`;
            
            if (type === 'success') {
                setTimeout(() => {
                    statusEl.style.display = 'none';
                }, 3000);
            }
        }
    }

            updateLogoutButton() {
                const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
                if (this.logoutBtn) {
                    this.logoutBtn.style.display = isLoggedIn ? 'flex' : 'none';
                }
            }

            handleLogout() {
                if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('isLoggedIn');
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('loginMethod');
                    window.location.href = '/login.html';
                }
            }

            updateDataSourceDisplay(source, data = null) {
                const dataSource = document.getElementById('dataSource');
                const updateInfo = document.getElementById('updateInfo');

                if (source === 'uploaded' && data) {
                    const date = new Date(data.date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                    if (dataSource) {
                        dataSource.textContent = `Data from uploaded CSV (${date})`;
                    }
                    if (updateInfo) {
                        updateInfo.textContent = 'Static data from file';
                    }
                } else {
                    // Get API name from settings
                    const apiName = window.settingsManager?.getActiveApiConfig()?.name || 'NSE India';
                    if (dataSource) {
                        dataSource.textContent = `Data from ${apiName}`;
                    }
                    if (updateInfo) {
                        updateInfo.textContent = 'Updates every 30 sec. during market hrs.';
                    }
                }
            }

            updateLogoutButton() {
                const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
                if (this.logoutBtn) {
                    this.logoutBtn.style.display = isLoggedIn ? 'flex' : 'none';
                }
            }

            handleLogout() {
                if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('isLoggedIn');
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('loginMethod');
                    window.location.href = '/login.html';
                }
            }
        }

        // Check authentication before initializing app
        function checkAuth() {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            const currentPath = window.location.pathname;
            
            // If not logged in and not on login page, redirect to login
            if (!isLoggedIn && !currentPath.includes('login.html')) {
                window.location.href = '/login.html';
                return false;
            }
            
            // If logged in and on login page, redirect to main app
            if (isLoggedIn && currentPath.includes('login.html')) {
                window.location.href = '/';
                return false;
            }
            
            return true;
        }

        // Initialize app when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            // Only initialize if auth check passes (or if on login page)
            if (window.location.pathname.includes('login.html')) {
                return; // Login page handles its own logic
            }
            
            if (checkAuth()) {
                window.marketMoodApp = new MarketMoodApp();
            }
        });