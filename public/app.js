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

        // Setup scroll-based footer hide/show
        this.setupFooterScrollBehavior();
    }

    setupFooterScrollBehavior() {
        const footer = document.querySelector('footer');
        if (!footer) return;

        let lastScrollTop = 0;
        let scrollTimeout = null;
        let isScrolling = false;

        const handleScroll = () => {
            if (isScrolling) return;
            isScrolling = true;

            // Clear existing timeout
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }

            // Get current scroll position
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

            // Determine scroll direction
            if (scrollTop > lastScrollTop && scrollTop > 100) {
                // Scrolling down - hide footer
                footer.classList.add('hidden');
            } else if (scrollTop < lastScrollTop) {
                // Scrolling up - show footer
                footer.classList.remove('hidden');
            }

            // Update last scroll position
            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;

            // Reset scrolling flag after a short delay
            scrollTimeout = setTimeout(() => {
                isScrolling = false;
            }, 150);
        };

        // Throttle scroll events for better performance
        let ticking = false;
        const throttledScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        };

        // Add scroll listener
        window.addEventListener('scroll', throttledScroll, { passive: true });

        // Also handle scroll on the container if it's scrollable
        const container = document.querySelector('.container');
        if (container) {
            container.addEventListener('scroll', throttledScroll, { passive: true });
        }

        // Show footer initially
        footer.classList.remove('hidden');

        // Setup elastic scroll effect
        this.setupElasticScroll();
    }

    setupElasticScroll() {
        // Enable elastic scrolling on iOS (native)
        // For other browsers, add visual feedback
        const body = document.body;
        const html = document.documentElement;
        
        let isAtTop = false;
        let isAtBottom = false;
        let lastScrollTop = 0;
        
        const checkScrollBounds = () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
            const windowHeight = window.innerHeight;
            const documentHeight = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
            );
            
            // Check if at top or bottom
            const atTop = scrollTop <= 0;
            const atBottom = scrollTop + windowHeight >= documentHeight - 1;
            
            // Add elastic effect classes
            if (atTop && !isAtTop) {
                body.classList.add('scroll-at-top');
                isAtTop = true;
            } else if (!atTop && isAtTop) {
                body.classList.remove('scroll-at-top');
                isAtTop = false;
            }
            
            if (atBottom && !isAtBottom) {
                body.classList.add('scroll-at-bottom');
                isAtBottom = true;
            } else if (!atBottom && isAtBottom) {
                body.classList.remove('scroll-at-bottom');
                isAtBottom = false;
            }
            
            lastScrollTop = scrollTop;
        };
        
        // Check on scroll
        window.addEventListener('scroll', () => {
            checkScrollBounds();
        }, { passive: true });
        
        // Check on touch events for better mobile support
        let touchStartY = 0;
        let touchEndY = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            touchEndY = e.touches[0].clientY;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
            const windowHeight = window.innerHeight;
            const documentHeight = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
            );
            
            // Check if trying to scroll past boundaries
            const scrollingUp = touchEndY > touchStartY;
            const scrollingDown = touchEndY < touchStartY;
            
            if (scrollTop <= 0 && scrollingUp) {
                // At top, trying to scroll up - add elastic effect
                body.classList.add('elastic-top');
            } else {
                body.classList.remove('elastic-top');
            }
            
            if (scrollTop + windowHeight >= documentHeight - 1 && scrollingDown) {
                // At bottom, trying to scroll down - add elastic effect
                body.classList.add('elastic-bottom');
            } else {
                body.classList.remove('elastic-bottom');
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            // Remove elastic classes after touch ends
            setTimeout(() => {
                body.classList.remove('elastic-top', 'elastic-bottom');
            }, 200);
        }, { passive: true });
        
        // Initial check
        checkScrollBounds();
    }

    init() {
        // Immediately update theme color on init for PWA mode
        // This ensures Dynamic Island area has correct color from start
        const initialColor = getComputedStyle(document.documentElement).getPropertyValue('--mood-bg-color').trim() || '#667eea';
        this.updateThemeColor(initialColor);
        
        this.updateTimeEl = document.getElementById('updateTime');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.signalsBtn = document.getElementById('signalsBtn');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.menuBtn = document.getElementById('menuBtn');
        this.menuModal = document.getElementById('menuModal');
        this.aiConnectBtn = document.getElementById('aiConnectBtn');
        this.logoutMenuBtn = document.getElementById('logoutMenuBtn');
        this.aiConnectModal = document.getElementById('aiConnectModal');

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.handleManualRefresh());
        }
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => {
                if (window.settingsManager) {
                    window.settingsManager.openSettingsModal();
                }
            });
        }
        if (this.signalsBtn) {
            this.signalsBtn.addEventListener('click', () => this.handleSignals());
        }
        if (this.uploadBtn) {
            this.uploadBtn.addEventListener('click', () => this.openUploadModal());
        }
        if (this.menuBtn) {
            this.menuBtn.addEventListener('click', () => this.openMenuModal());
        }
        if (this.aiConnectBtn) {
            this.aiConnectBtn.addEventListener('click', () => this.openAiConnectModal());
        }
        if (this.logoutMenuBtn) {
            this.logoutMenuBtn.addEventListener('click', () => this.handleLogout());
        }

        // Setup menu modal close handlers
        this.setupMenuModal();
        
        // Setup AI Connect modal handlers
        this.setupAiConnectModal();

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

        // Setup custom calendar for loading data from database
        this.customCalendar = document.getElementById('customCalendar');
        this.calendarModal = document.getElementById('calendarModal');
        this.calendarTriggerBtn = document.getElementById('calendarTriggerBtn');
        this.closeCalendarBtn = document.getElementById('closeCalendar');
        this.selectedDateDisplay = document.getElementById('selectedDateDisplay');
        this.availableDates = []; // Store available dates for lookup
        this.availableDatesData = new Map(); // Store date -> mood data mapping
        this.currentCalendarDate = new Date(); // Current month being displayed
        this.selectedCalendarDate = null; // Currently selected date
        
        if (this.calendarTriggerBtn) {
            this.calendarTriggerBtn.addEventListener('click', () => {
                this.openCalendarModal();
            });
        }
        
        if (this.closeCalendarBtn) {
            this.closeCalendarBtn.addEventListener('click', () => {
                this.closeCalendarModal();
            });
        }
        
        // Close calendar when clicking outside
        if (this.calendarModal) {
            this.calendarModal.addEventListener('click', (e) => {
                if (e.target === this.calendarModal) {
                    this.closeCalendarModal();
                }
            });
        }
        
        if (this.customCalendar) {
            // Setup calendar navigation
            const prevMonthBtn = document.getElementById('prevMonthBtn');
            const nextMonthBtn = document.getElementById('nextMonthBtn');
            
            if (prevMonthBtn) {
                prevMonthBtn.addEventListener('click', () => {
                    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
                    this.renderCalendar();
                });
            }
            
            if (nextMonthBtn) {
                nextMonthBtn.addEventListener('click', () => {
                    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
                    this.renderCalendar();
                });
            }
            
            // Check if uploaded data is available and show/hide calendar trigger
            this.checkAndShowDatePicker();
        }

        // Load saved view preference
        const savedView = localStorage.getItem('indicesViewMode');
        if (savedView === 'table' || savedView === 'card') {
            this.viewMode = savedView;
        } else {
            // Default to card view
            this.viewMode = 'card';
            localStorage.setItem('indicesViewMode', 'card');
        }
        this.updateViewToggleButtons();

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
            // First try localStorage
            let uploadedData = this.getUploadedData();
            
            // If not in localStorage, try to load from database using the selected date
            if ((!uploadedData || !uploadedData.indices || uploadedData.indices.length === 0)) {
                const selectedDate = window.settingsManager?.settings?.uploadedDataDate;
                if (selectedDate) {
                    try {
                        console.log('Loading uploaded data from database for date:', selectedDate);
                        const response = await fetch(`/api/get-uploaded-data?date=${encodeURIComponent(selectedDate)}`);
                        if (response.ok) {
                            const data = await response.json();
                            if (data && data.indices && data.indices.length > 0) {
                                // Format data to match expected structure
                                uploadedData = {
                                    indices: data.indices,
                                    date: data.date,
                                    fileName: data.fileName,
                                    mood: data.mood || this.calculateMoodFromIndices(data.indices),
                                    vix: data.vix || null,
                                    advanceDecline: data.advanceDecline || { advances: 0, declines: 0 },
                                    source: 'database'
                                };
                                // Save to localStorage for future use
                                localStorage.setItem('uploadedIndicesData', JSON.stringify(uploadedData));
                            }
                        }
                    } catch (error) {
                        console.warn('Could not load from database:', error);
                    }
                }
            }
            
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
            const card = this.createIndexCard(nifty50);
            this.applyCardStyles(card);
            mainGrid.appendChild(card);
        } else {
            console.warn('NIFTY 50 not found in indices');
        }
        if (niftyBank) {
            const card = this.createIndexCard(niftyBank);
            this.applyCardStyles(card);
            mainGrid.appendChild(card);
        } else {
            console.warn('NIFTY BANK not found in indices');
        }

        // Second row: NIFTY IT, INDIA VIX
        const niftyIT = findIndex(indices, ['NIFTY IT', 'Nifty IT', 'NIFTYIT']);
        if (niftyIT) {
            const card = this.createIndexCard(niftyIT);
            this.applyCardStyles(card);
            mainGrid.appendChild(card);
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
            const card = this.createIndexCard({
                symbol: 'INDIA VIX',
                lastPrice: vixData.last,
                change: vixData.change,
                pChange: vixData.pChange
            });
            this.applyCardStyles(card);
            mainGrid.appendChild(card);
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

    applyCardStyles(card) {
        // Apply inline styles to ensure white oval background
        if (card) {
            card.style.display = 'flex';
            card.style.visibility = 'visible';
            card.style.opacity = '1';
            card.style.width = '100%';
            card.style.maxWidth = '100%';
            card.style.background = 'white';
            card.style.borderRadius = '20px';
            card.style.padding = '20px 15px';
            card.style.minHeight = '120px';
            card.style.boxSizing = 'border-box';
            card.style.flexDirection = 'column';
            card.style.justifyContent = 'center';
            card.style.alignItems = 'center';
            card.style.textAlign = 'center';
            card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }
    }

    renderIndicesCards(indices) {
        const allIndicesGrid = document.getElementById('allIndicesGrid');
        const tableContainer = document.getElementById('tableContainer');
        const allIndicesSection = document.getElementById('allIndicesSection');
        
        if (!allIndicesGrid) {
            console.error('allIndicesGrid element not found');
            return;
        }
        
        // Ensure section is visible
        if (allIndicesSection) {
            allIndicesSection.style.display = 'block';
        }
        
        // Ensure view mode is set to card and update buttons
        this.viewMode = 'card';
        this.updateViewToggleButtons();
        
        // Hide table first with !important to override any CSS
        if (tableContainer) {
            tableContainer.style.setProperty('display', 'none', 'important');
            tableContainer.style.setProperty('visibility', 'hidden', 'important');
            tableContainer.style.setProperty('opacity', '0', 'important');
        }
        
        // Force grid display with inline styles using !important
        allIndicesGrid.style.setProperty('display', 'grid', 'important');
        allIndicesGrid.style.setProperty('grid-template-columns', '1fr 1fr', 'important');
        allIndicesGrid.style.setProperty('gap', '15px', 'important');
        allIndicesGrid.style.setProperty('visibility', 'visible', 'important');
        allIndicesGrid.style.setProperty('opacity', '1', 'important');
        allIndicesGrid.style.setProperty('width', '100%', 'important');
        allIndicesGrid.style.setProperty('max-width', '100%', 'important');
        allIndicesGrid.style.setProperty('height', 'auto', 'important');
        allIndicesGrid.style.setProperty('overflow', 'visible', 'important');
        allIndicesGrid.classList.add('all-indices-grid');
        
        // Clear and populate grid
        allIndicesGrid.innerHTML = '';
        
        if (!indices || indices.length === 0) {
            console.warn('No indices to render in card view');
            return;
        }
        
        indices.forEach(index => {
            const card = this.createIndexCard(index);
            if (card) {
                // Apply card styles using helper function
                this.applyCardStyles(card);
                allIndicesGrid.appendChild(card);
            }
        });
        
        // Force reflow to ensure styles are applied
        void allIndicesGrid.offsetHeight;
        
        console.log(`Rendered ${indices.length} cards in grid view`);
        console.log('Grid element:', allIndicesGrid);
        console.log('Grid display:', allIndicesGrid.style.display);
        console.log('Grid computed display:', window.getComputedStyle(allIndicesGrid).display);
        console.log('Grid computed columns:', window.getComputedStyle(allIndicesGrid).gridTemplateColumns);
    }

    renderIndicesTable(indices) {
        const allIndicesGrid = document.getElementById('allIndicesGrid');
        const tableContainer = document.getElementById('tableContainer');
        const tableBody = document.getElementById('indicesTableBody');
        
        if (!tableContainer || !tableBody) return;
        
        // Ensure view mode is set to table
        this.viewMode = 'table';
        this.updateViewToggleButtons();
        
        // Hide grid completely with !important to override any CSS
        if (allIndicesGrid) {
            allIndicesGrid.style.setProperty('display', 'none', 'important');
            allIndicesGrid.style.setProperty('visibility', 'hidden', 'important');
            allIndicesGrid.style.setProperty('opacity', '0', 'important');
            allIndicesGrid.style.setProperty('height', '0', 'important');
            allIndicesGrid.style.setProperty('overflow', 'hidden', 'important');
        }
        
        // Show table
        tableContainer.style.setProperty('display', 'block', 'important');
        tableContainer.style.setProperty('visibility', 'visible', 'important');
        tableContainer.style.setProperty('opacity', '1', 'important');
        
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
                        // Force card view rendering with a small delay to ensure DOM is ready
                        setTimeout(() => {
                            this.renderIndicesCards(sortedOtherIndices);
                        }, 10);
                    }
                }
            }
        }
    }

    updateViewToggleButtons() {
        // Always ensure both buttons exist
        if (!this.cardViewBtn) {
            this.cardViewBtn = document.getElementById('cardViewBtn');
        }
        if (!this.tableViewBtn) {
            this.tableViewBtn = document.getElementById('tableViewBtn');
        }
        
        if (this.cardViewBtn && this.tableViewBtn) {
            // Always remove active from both first to prevent both being active
            this.cardViewBtn.classList.remove('active');
            this.tableViewBtn.classList.remove('active');
            
            // Then add active to the correct one based on current view mode
            if (this.viewMode === 'card') {
                this.cardViewBtn.classList.add('active');
            } else if (this.viewMode === 'table') {
                this.tableViewBtn.classList.add('active');
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
        
        // Update CSS custom property for safe-area-inset background
        // Update CSS custom properties for mood-based colors with !important
        document.documentElement.style.setProperty('--mood-bg-color', themeColor, 'important');
        document.documentElement.style.setProperty('--mood-gradient', gradient, 'important');
        
        // Also update html background to extend to top safe area
        const html = document.documentElement;
        html.style.setProperty('background-color', themeColor, 'important');
        html.style.setProperty('background-image', gradient, 'important');
        html.style.setProperty('background-attachment', 'fixed', 'important');
        html.style.setProperty('background-size', 'cover', 'important');
        html.style.setProperty('background-repeat', 'no-repeat', 'important');
        
        // Update body background
        body.style.setProperty('background-color', themeColor, 'important');
        body.style.setProperty('background-image', gradient, 'important');
        body.style.setProperty('background-attachment', 'fixed', 'important');
        body.style.setProperty('background-size', 'cover', 'important');
        body.style.setProperty('background-repeat', 'no-repeat', 'important');
        
        // Force update body::before pseudo-element via dynamic style element
        // This ensures the safe area overlay always shows mood color, even in dark mode
        const styleId = 'safeAreaDynamicStyle';
        let dynamicStyle = document.getElementById(styleId);
        if (!dynamicStyle) {
            dynamicStyle = document.createElement('style');
            dynamicStyle.id = styleId;
            document.head.appendChild(dynamicStyle);
        }
        dynamicStyle.textContent = `
            body::before {
                background: ${gradient} !important;
                background-color: ${themeColor} !important;
                background-image: ${gradient} !important;
            }
        `;
    }

    updateThemeColor(color) {
        // Update or create theme-color meta tag for PWA inset
        // This is CRITICAL for iOS PWA Dynamic Island/notch area
        let themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeColorMeta) {
            themeColorMeta = document.createElement('meta');
            themeColorMeta.setAttribute('name', 'theme-color');
            document.head.appendChild(themeColorMeta);
        }
        // Remove and re-add to force update in PWA mode
        const oldContent = themeColorMeta.getAttribute('content');
        if (oldContent !== color) {
            themeColorMeta.remove();
            themeColorMeta = document.createElement('meta');
            themeColorMeta.setAttribute('name', 'theme-color');
            themeColorMeta.setAttribute('content', color);
            document.head.insertBefore(themeColorMeta, document.head.firstChild);
        } else {
            themeColorMeta.setAttribute('content', color);
        }
        
        // Also update iOS Safari status bar style - black-translucent allows background to show
        let appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (!appleStatusBar) {
            appleStatusBar = document.createElement('meta');
            appleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
            document.head.appendChild(appleStatusBar);
        }
        // Use black-translucent for iOS PWA to show the theme color through
        appleStatusBar.setAttribute('content', 'black-translucent');
        
        // Force update the html and body background immediately for PWA
        const html = document.documentElement;
        const body = document.body;
        html.style.setProperty('background-color', color, 'important');
        body.style.setProperty('background-color', color, 'important');
        
        // Create or update a fixed overlay div for Dynamic Island area (more reliable than ::before)
        // Get current gradient from CSS variable
        const gradient = getComputedStyle(document.documentElement).getPropertyValue('--mood-gradient').trim() || 
                        `linear-gradient(135deg, ${color} 0%, ${color} 100%)`;
        
        let safeAreaOverlay = document.getElementById('safeAreaOverlay');
        if (!safeAreaOverlay) {
            safeAreaOverlay = document.createElement('div');
            safeAreaOverlay.id = 'safeAreaOverlay';
            document.body.appendChild(safeAreaOverlay);
        }
        
        // Force update with !important to override dark mode
        safeAreaOverlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: env(safe-area-inset-top, 0px) !important;
            min-height: env(safe-area-inset-top, 0px) !important;
            background-color: ${color} !important;
            background-image: ${gradient} !important;
            background: ${gradient} !important;
            background-attachment: fixed !important;
            background-size: cover !important;
            background-repeat: no-repeat !important;
            z-index: 99999 !important;
            pointer-events: none !important;
        `;
        
        // Force a repaint to ensure updates are visible
        void body.offsetHeight;
        
        console.log('Updated PWA theme color to:', color);
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
                this.unlockBodyScroll();
            });
        }

        if (cancelUpload && uploadModal) {
            cancelUpload.addEventListener('click', () => {
                uploadModal.classList.remove('show');
                this.unlockBodyScroll();
            });
        }

        // File selection
        if (csvFile && fileName) {
            csvFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    fileName.textContent = file.name;
                    this.updateUploadButtonState();
                    
                    // Validate file type
                    const fileExtension = file.name.split('.').pop().toLowerCase();
                    if (fileExtension !== 'csv' && fileExtension !== 'dat') {
                        this.showUploadStatus('Please select a CSV or DAT file', 'error');
                        if (uploadDataBtn) uploadDataBtn.disabled = true;
                    }
                } else {
                    fileName.textContent = 'Choose CSV or DAT file...';
                    this.updateUploadButtonState();
                }
            });
        }

        // Upload type selection
        const uploadTypeSelect = document.getElementById('uploadType');
        if (uploadTypeSelect) {
            uploadTypeSelect.addEventListener('change', () => {
                this.updateUploadButtonState();
            });
        }

        // Upload button
        if (uploadDataBtn && csvFile && dataDate) {
            uploadDataBtn.addEventListener('click', () => {
                const file = csvFile.files[0];
                const date = dataDate.value;
                const uploadType = document.getElementById('uploadType')?.value;
                
                if (!file || !date || !uploadType) {
                    this.showUploadStatus('Please select a file, date, and data type', 'error');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        // Detect file type and parse accordingly
                        const fileExtension = file.name.split('.').pop().toLowerCase();
                        let parsedData;
                        
                        if (fileExtension === 'dat') {
                            parsedData = this.parseDATFile(e.target.result);
                        } else {
                            // Default to CSV parsing
                            parsedData = this.parseCSV(e.target.result);
                        }
                        
                        const processedData = this.processCSVData(parsedData, date, file.name);
                        
                        // Add type to processed data
                        processedData.type = uploadType;
                        
                        // Store in localStorage with type-specific key
                        const storageKey = `uploaded${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)}Data`;
                        localStorage.setItem(storageKey, JSON.stringify(processedData));
                        
                        // Also save to database (optional - will work even if DB is not configured)
                        this.saveToDatabase(processedData, file.name, date, uploadType).catch(err => {
                            console.warn('Failed to save to database (continuing with localStorage):', err);
                        });
                        
                        this.showUploadStatus('Data uploaded successfully!', 'success');
                        this.updateUploadedDataInfo();
                        
                        // Check and show date picker after upload
                        this.checkAndShowDatePicker();
                        
                        // Reload data to use uploaded CSV
                        setTimeout(() => {
                            if (uploadModal) uploadModal.classList.remove('show');
                            this.unlockBodyScroll();
                            this.loadData();
                        }, 1500);
                    } catch (error) {
                        console.error('Error processing file:', error);
                        this.showUploadStatus('Error processing file: ' + error.message, 'error');
                    }
                };
                reader.readAsText(file);
            });
        }

        // Note: Clear button removed - users can delete individual files from the table

        // Update uploaded data info on load
        this.updateUploadedDataInfo();
    }

    updateUploadButtonState() {
        const uploadDataBtn = document.getElementById('uploadDataBtn');
        const csvFile = document.getElementById('csvFile');
        const dataDate = document.getElementById('dataDate');
        const uploadType = document.getElementById('uploadType');
        
        if (uploadDataBtn && csvFile && dataDate && uploadType) {
            const hasFile = csvFile.files && csvFile.files.length > 0;
            const hasDate = dataDate.value && dataDate.value.trim() !== '';
            const hasType = uploadType.value && uploadType.value.trim() !== '';
            
            uploadDataBtn.disabled = !(hasFile && hasDate && hasType);
        }
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

    parseDATFile(datText) {
        // .DAT files can have various formats. Try to detect the format:
        // 1. CSV-like format (comma or tab separated)
        // 2. Fixed-width format
        // 3. Other delimited formats
        
        const lines = datText.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('DAT file is empty or invalid');
        }

        // Check if it's CSV-like (contains commas or tabs)
        const firstLine = lines[0];
        const hasCommas = firstLine.includes(',');
        const hasTabs = firstLine.includes('\t');
        const hasPipes = firstLine.includes('|');
        
        let delimiter = ',';
        if (hasTabs) {
            delimiter = '\t';
        } else if (hasPipes) {
            delimiter = '|';
        } else if (hasCommas) {
            delimiter = ',';
        } else {
            // Try to detect delimiter by checking multiple lines
            for (let i = 0; i < Math.min(5, lines.length); i++) {
                if (lines[i].includes('\t')) {
                    delimiter = '\t';
                    break;
                } else if (lines[i].includes('|')) {
                    delimiter = '|';
                    break;
                } else if (lines[i].includes(',')) {
                    delimiter = ',';
                    break;
                }
            }
        }

        // Parse header
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        
        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseDelimitedLine(lines[i], delimiter);
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

    parseDelimitedLine(line, delimiter) {
        // Parse a line with a specific delimiter (handles quoted values)
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of value
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add last value
        values.push(current);
        return values;
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

    async saveToDatabase(data, fileName, dataDate, type = 'indices') {
        try {
            const response = await fetch('/api/save-uploaded-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileName: fileName || 'uploaded.csv',
                    date: dataDate || new Date().toISOString().split('T')[0],
                    type: type || 'indices',
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

    async checkAndShowDatePicker() {
        // Check if there's any uploaded data in the database
        try {
            const response = await fetch('/api/save-uploaded-data');
            const result = await response.json();
            
            if (this.calendarTriggerBtn) {
                if (result.success && result.data && result.data.length > 0) {
                    // Show calendar trigger button if data exists
                    this.calendarTriggerBtn.style.display = 'flex';
                    
                    // Store available dates and their mood data
                    this.availableDates = result.data.map(item => item.date).filter((date, index, self) => self.indexOf(date) === index).sort();
                    
                    // Store date -> mood mapping
                    this.availableDatesData.clear();
                    result.data.forEach(item => {
                        if (item.date) {
                            // Store mood data (could be object with score or just mood string)
                            this.availableDatesData.set(item.date, item.mood || null);
                        }
                    });
                    
                    // Render calendar when modal opens
                    // Don't render here, wait for modal to open
                } else {
                    // Hide calendar trigger button if no data
                    this.calendarTriggerBtn.style.display = 'none';
                    this.availableDates = [];
                    this.availableDatesData.clear();
                }
            }
        } catch (error) {
            console.error('Error checking for uploaded data:', error);
            // Hide calendar trigger button on error
            if (this.calendarTriggerBtn) {
                this.calendarTriggerBtn.style.display = 'none';
            }
            this.availableDates = [];
            this.availableDatesData.clear();
        }
    }

    openCalendarModal() {
        if (this.calendarModal) {
            this.calendarModal.classList.add('show');
            this.lockBodyScroll();
            // Render calendar when modal opens
            this.renderCalendar();
        }
    }

    closeCalendarModal() {
        if (this.calendarModal) {
            this.calendarModal.classList.remove('show');
            this.unlockBodyScroll();
        }
    }

    renderCalendar() {
        if (!this.customCalendar) return;
        
        const calendarDays = document.getElementById('calendarDays');
        const calendarMonthYear = document.getElementById('calendarMonthYear');
        
        if (!calendarDays || !calendarMonthYear) return;
        
        // Update month/year display
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();
        calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
        
        // Get first day of month and number of days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday
        
        // Get previous month's last days
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        
        calendarDays.innerHTML = '';
        
        // Previous month's days
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day other-month';
            dayEl.textContent = day;
            calendarDays.appendChild(dayEl);
        }
        
        // Current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;
            dayEl.setAttribute('data-date', dateStr);
            
            // Check if date has data
            if (this.availableDates.includes(dateStr)) {
                dayEl.classList.add('has-data');
                
                // Add mood color class based on mood string or score
                const moodData = this.availableDatesData.get(dateStr);
                if (moodData) {
                    let score = null;
                    
                    // Check if moodData is an object with score
                    if (typeof moodData === 'object' && moodData !== null && moodData.score !== undefined) {
                        score = moodData.score;
                    } else if (typeof moodData === 'string') {
                        // Try to extract score from mood string or use mood string to determine score
                        // Mood strings: "Very Bullish", "Bullish", "Slightly Bullish", "Neutral", "Slightly Bearish", "Bearish", "Very Bearish"
                        const moodLower = moodData.toLowerCase();
                        if (moodLower.includes('very bullish')) score = 75;
                        else if (moodLower.includes('bullish') && !moodLower.includes('slightly')) score = 65;
                        else if (moodLower.includes('slightly bullish')) score = 55;
                        else if (moodLower.includes('neutral')) score = 45;
                        else if (moodLower.includes('slightly bearish')) score = 35;
                        else if (moodLower.includes('bearish') && !moodLower.includes('slightly')) score = 25;
                        else if (moodLower.includes('very bearish')) score = 15;
                    }
                    
                    if (score !== null) {
                        if (score >= 70) {
                            dayEl.classList.add('mood-very-bullish');
                        } else if (score >= 60) {
                            dayEl.classList.add('mood-bullish');
                        } else if (score >= 50) {
                            dayEl.classList.add('mood-slightly-bullish');
                        } else if (score >= 40) {
                            dayEl.classList.add('mood-neutral');
                        } else if (score >= 30) {
                            dayEl.classList.add('mood-slightly-bearish');
                        } else if (score >= 20) {
                            dayEl.classList.add('mood-bearish');
                        } else {
                            dayEl.classList.add('mood-very-bearish');
                        }
                    }
                }
                
                // Add click handler
                dayEl.addEventListener('click', () => {
                    this.selectCalendarDate(dateStr);
                });
            } else {
                dayEl.classList.add('no-data');
                // Still allow click to load previous date
                dayEl.addEventListener('click', () => {
                    this.selectCalendarDate(dateStr);
                });
            }
            
            // Mark as selected if it's the selected date
            if (this.selectedCalendarDate === dateStr) {
                dayEl.classList.add('selected');
            }
            
            calendarDays.appendChild(dayEl);
        }
        
        // Next month's days to fill the grid
        const totalCells = startingDayOfWeek + daysInMonth;
        const remainingCells = 42 - totalCells; // 6 rows * 7 days = 42
        for (let day = 1; day <= remainingCells && day <= 14; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day other-month';
            dayEl.textContent = day;
            calendarDays.appendChild(dayEl);
        }
    }

    selectCalendarDate(dateStr) {
        // Update selected date
        this.selectedCalendarDate = dateStr;
        
        // Reload calendar to update selected state
        this.renderCalendar();
        
        // Load data for this date (or previous if no data)
        this.loadDataFromDatabaseByDate(dateStr);
    }

    findPreviousAvailableDate(selectedDate) {
        // Find the most recent date that is before or equal to the selected date
        if (!this.availableDates || this.availableDates.length === 0) {
            return null;
        }
        
        // Sort dates in descending order to find the latest available date before selected
        const sortedDates = [...this.availableDates].sort((a, b) => new Date(b) - new Date(a));
        
        for (const date of sortedDates) {
            if (date <= selectedDate) {
                return date;
            }
        }
        
        // If no date found before selected, return the earliest available date
        return sortedDates[sortedDates.length - 1];
    }

    async loadDataFromDatabaseByDate(date) {
        try {
            console.log('Loading data from database for date:', date);
            this.setLoading(true);

            // Check if date has data, if not find previous available date
            let dateToLoad = date;
            let isPreviousDate = false;
            
            if (!this.availableDates.includes(date)) {
                // Date doesn't have data, find previous available date
                const previousDate = this.findPreviousAvailableDate(date);
                if (previousDate) {
                    dateToLoad = previousDate;
                    isPreviousDate = true;
                    console.log(`Date ${date} has no data, loading previous available date: ${previousDate}`);
                } else {
                    this.showUploadStatus(`No data available for ${date} or any previous date`, 'error');
                    this.setLoading(false);
                    return;
                }
            }

            // Fetch data from database by date with full data
            const response = await fetch(`/api/save-uploaded-data?date=${dateToLoad}&full=true`);
            const result = await response.json();

            if (result.success && result.data && result.data.length > 0) {
                // Use the most recent upload for that date
                const data = result.data[0];
                
                if (data.indices && data.indices.length > 0) {
                    // Format data to match expected structure
                    const formattedData = {
                        indices: data.indices,
                        mood: data.mood,
                        vix: data.vix,
                        advanceDecline: data.advanceDecline,
                        fileName: data.fileName,
                        date: data.date,
                        source: 'database',
                        timestamp: data.uploadedAt
                    };

                    console.log(`✅ Loaded ${data.indices.length} indices from database for ${dateToLoad}`);
                    
                    // Update UI with database data
                    this.updateDataSourceDisplay('database', formattedData);
                    this.updateUI(formattedData);
                    
                    // Also save to localStorage for consistency
                    localStorage.setItem('uploadedIndicesData', JSON.stringify(formattedData));
                    
                    // Show notification
                    if (isPreviousDate) {
                        this.showUploadStatus(`No data for ${date}, loaded previous date: ${dateToLoad}`, 'success');
                    } else {
                        this.showUploadStatus(`Loaded data from ${dateToLoad}`, 'success');
                    }
                } else {
                    console.warn('No indices data found for date:', dateToLoad);
                    this.showUploadStatus(`No data found for ${dateToLoad}`, 'error');
                    this.setLoading(false);
                }
            } else {
                console.warn('No data found in database for date:', dateToLoad);
                this.showUploadStatus(`No uploaded data found for ${dateToLoad}`, 'error');
                this.setLoading(false);
            }
        } catch (error) {
            console.error('Error loading data from database:', error);
            this.showUploadStatus('Error loading data from database', 'error');
            this.setLoading(false);
        }
    }

    async updateUploadedDataInfo() {
        const uploadedDataInfo = document.getElementById('uploadedDataInfo');
        const tableBody = document.getElementById('uploadedFilesTableBody');
        const loadingEl = document.getElementById('uploadedFilesLoading');
        const emptyEl = document.getElementById('uploadedFilesEmpty');
        const tableEl = document.getElementById('uploadedFilesTable');

        if (!uploadedDataInfo || !tableBody) return;

        // Show loading state
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (tableEl) tableEl.style.display = 'none';
        // Clear table body completely
        tableBody.innerHTML = '';
        
        // Debug: Log when function is called
        console.log('updateUploadedDataInfo called');

        try {
            // Fetch all uploaded files from all 3 collections
            const [indicesResponse, bhavResponse, premarketResponse] = await Promise.all([
                fetch('/api/save-uploaded-data?type=indices'),
                fetch('/api/save-uploaded-data?type=bhav'),
                fetch('/api/save-uploaded-data?type=premarket')
            ]);

            const indicesResult = await indicesResponse.json();
            const bhavResult = await bhavResponse.json();
            const premarketResult = await premarketResponse.json();

            if (loadingEl) loadingEl.style.display = 'none';

            // Helper function to normalize date string (YYYY-MM-DD format)
            const normalizeDate = (dateStr) => {
                if (!dateStr) return null;
                // Extract just the date part (YYYY-MM-DD) if it includes time
                const dateOnly = dateStr.split('T')[0].split(' ')[0];
                // Validate format
                if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    return dateOnly;
                }
                return dateStr;
            };

            // Combine all data and group by date
            const dateMap = new Map();

            // Process indices data
            if (indicesResult.success && indicesResult.data) {
                indicesResult.data.forEach(file => {
                    const normalizedDate = normalizeDate(file.date);
                    if (normalizedDate) {
                        if (!dateMap.has(normalizedDate)) {
                            dateMap.set(normalizedDate, {
                                date: normalizedDate,
                                indices: { count: 0, id: null },
                                bhav: { count: 0, id: null },
                                premarket: { count: 0, id: null },
                                uploadedAt: file.uploadedAt
                            });
                        }
                        const dateData = dateMap.get(normalizedDate);
                        const count = file.indicesCount || (Array.isArray(file.indices) ? file.indices.length : 0);
                        if (count > dateData.indices.count) {
                            dateData.indices.count = count;
                            dateData.indices.id = file.id;
                        }
                        // Keep the most recent uploadedAt
                        if (new Date(file.uploadedAt) > new Date(dateData.uploadedAt)) {
                            dateData.uploadedAt = file.uploadedAt;
                        }
                    }
                });
            }

            // Process bhav data
            if (bhavResult.success && bhavResult.data) {
                bhavResult.data.forEach(file => {
                    const normalizedDate = normalizeDate(file.date);
                    if (normalizedDate) {
                        if (!dateMap.has(normalizedDate)) {
                            dateMap.set(normalizedDate, {
                                date: normalizedDate,
                                indices: { count: 0, id: null },
                                bhav: { count: 0, id: null },
                                premarket: { count: 0, id: null },
                                uploadedAt: file.uploadedAt
                            });
                        }
                        const dateData = dateMap.get(normalizedDate);
                        const count = file.indicesCount || (Array.isArray(file.indices) ? file.indices.length : 0);
                        if (count > dateData.bhav.count) {
                            dateData.bhav.count = count;
                            dateData.bhav.id = file.id;
                        }
                        // Keep the most recent uploadedAt
                        if (new Date(file.uploadedAt) > new Date(dateData.uploadedAt)) {
                            dateData.uploadedAt = file.uploadedAt;
                        }
                    }
                });
            }

            // Process premarket data
            if (premarketResult.success && premarketResult.data) {
                premarketResult.data.forEach(file => {
                    const normalizedDate = normalizeDate(file.date);
                    if (normalizedDate) {
                        if (!dateMap.has(normalizedDate)) {
                            dateMap.set(normalizedDate, {
                                date: normalizedDate,
                                indices: { count: 0, id: null },
                                bhav: { count: 0, id: null },
                                premarket: { count: 0, id: null },
                                uploadedAt: file.uploadedAt
                            });
                        }
                        const dateData = dateMap.get(normalizedDate);
                        const count = file.indicesCount || (Array.isArray(file.indices) ? file.indices.length : 0);
                        if (count > dateData.premarket.count) {
                            dateData.premarket.count = count;
                            dateData.premarket.id = file.id;
                        }
                        // Keep the most recent uploadedAt
                        if (new Date(file.uploadedAt) > new Date(dateData.uploadedAt)) {
                            dateData.uploadedAt = file.uploadedAt;
                        }
                    }
                });
            }

            // Convert map to array and ensure no duplicates
            const groupedDataArray = Array.from(dateMap.values());
            
            // Final deduplication by date (in case normalization missed something)
            const finalDateMap = new Map();
            groupedDataArray.forEach(item => {
                const dateKey = item.date ? item.date.toString().trim() : null;
                if (dateKey) {
                    // If date already exists, merge the data (keep max counts and all IDs)
                    if (finalDateMap.has(dateKey)) {
                        const existing = finalDateMap.get(dateKey);
                        // Keep the maximum count for each type
                        if (item.indices.count > existing.indices.count) {
                            existing.indices.count = item.indices.count;
                            existing.indices.id = item.indices.id;
                        }
                        if (item.bhav.count > existing.bhav.count) {
                            existing.bhav.count = item.bhav.count;
                            existing.bhav.id = item.bhav.id;
                        }
                        if (item.premarket.count > existing.premarket.count) {
                            existing.premarket.count = item.premarket.count;
                            existing.premarket.id = item.premarket.id;
                        }
                        // Keep the most recent uploadedAt
                        if (new Date(item.uploadedAt) > new Date(existing.uploadedAt)) {
                            existing.uploadedAt = item.uploadedAt;
                        }
                    } else {
                        finalDateMap.set(dateKey, { ...item });
                    }
                }
            });
            
            // Convert to array and sort by date descending
            const groupedData = Array.from(finalDateMap.values()).sort((a, b) => {
                return new Date(b.date) - new Date(a.date);
            });
            
            console.log(`Grouped ${groupedData.length} unique dates from all collections:`, groupedData.map(d => d.date));
            console.log('Date map keys:', Array.from(dateMap.keys()));
            console.log('Final date map keys:', Array.from(finalDateMap.keys()));

            if (groupedData.length > 0) {
                // Show table and hide empty message
                if (tableEl) tableEl.style.display = 'table';
                if (emptyEl) emptyEl.style.display = 'none';
                uploadedDataInfo.style.display = 'block';

                // Populate table - ensure we only add each date once
                const addedDates = new Set();
                groupedData.forEach((dateData, index) => {
                    // Skip if this date was already added
                    if (addedDates.has(dateData.date)) {
                        console.warn(`Skipping duplicate date: ${dateData.date}`);
                        return;
                    }
                    addedDates.add(dateData.date);
                    
                    const row = document.createElement('tr');
                    
                    // Format date as DD/MM
                    let formattedDate = 'N/A';
                    if (dateData.date) {
                        try {
                            const dateParts = dateData.date.split('-');
                            if (dateParts.length === 3) {
                                const day = dateParts[2];
                                const month = dateParts[1];
                                formattedDate = `${day}/${month}`;
                            } else {
                                formattedDate = dateData.date;
                            }
                        } catch (e) {
                            formattedDate = dateData.date;
                        }
                    }
                    
                    // Use orange color for date text
                    const dateColor = '#f97316'; // Orange color
                    
                    // Check if Bhav and Pre-market have data
                    const hasBhav = (dateData.bhav?.count || 0) > 0;
                    const hasPremarket = (dateData.premarket?.count || 0) > 0;
                    
                    row.innerHTML = `
                        <td>${index + 1}</td>
                        <td style="color: ${dateColor};">${formattedDate}</td>
                        <td style="color: ${(dateData.indices?.count || 0) > 0 ? dateColor : '#999'};">${dateData.indices?.count || 0}</td>
                        <td style="color: ${hasBhav ? dateColor : '#999'}; text-align: center;">${hasBhav ? '✓' : ''}</td>
                        <td style="color: ${hasPremarket ? dateColor : '#999'}; text-align: center;">${hasPremarket ? '✓' : ''}</td>
                        <td class="action-buttons">
                            <button class="btn-export" data-date="${dateData.date}" title="Export as CSV">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            </button>
                            <button class="btn-delete" data-date="${dateData.date}" data-indices-id="${dateData.indices?.id || ''}" data-bhav-id="${dateData.bhav?.id || ''}" data-premarket-id="${dateData.premarket?.id || ''}" title="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });

                // Add event listeners for export and delete buttons
                tableBody.querySelectorAll('.btn-export').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const date = e.currentTarget.getAttribute('data-date');
                        // Export all types for this date
                        this.exportCSV(null, date);
                    });
                });

                tableBody.querySelectorAll('.btn-delete').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const date = e.currentTarget.getAttribute('data-date');
                        const indicesId = e.currentTarget.getAttribute('data-indices-id');
                        const bhavId = e.currentTarget.getAttribute('data-bhav-id');
                        const premarketId = e.currentTarget.getAttribute('data-premarket-id');
                        
                        // Delete all types for this date
                        const idsToDelete = [
                            { id: indicesId, type: 'indices' },
                            { id: bhavId, type: 'bhav' },
                            { id: premarketId, type: 'premarket' }
                        ].filter(item => item.id);
                        
                        if (idsToDelete.length === 0) {
                            this.showUploadStatus('No data to delete for this date', 'error');
                            return;
                        }
                        
                        // Confirm deletion
                        if (!confirm(`Delete all uploaded data for ${date}?`)) {
                            return;
                        }
                        
                        // Delete all types
                        for (const item of idsToDelete) {
                            await this.deleteUploadedFile(item.id, item.type);
                        }
                        
                        // Refresh the table
                        this.updateUploadedDataInfo();
                    });
                });
            } else {
                // No data found
                if (tableEl) tableEl.style.display = 'none';
                if (emptyEl) emptyEl.style.display = 'block';
                uploadedDataInfo.style.display = 'block';
            }
        } catch (error) {
            console.error('Error fetching uploaded files:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) {
                emptyEl.textContent = 'Error loading uploaded files.';
                emptyEl.style.display = 'block';
            }
            if (tableEl) tableEl.style.display = 'none';
        }
    }

    async exportCSV(fileId, date) {
        try {
            // Fetch full data for the file
            const response = await fetch(`/api/save-uploaded-data?id=${fileId}&full=true`);
            const result = await response.json();

            if (result.success && result.data && result.data.length > 0) {
                const fileData = result.data[0];
                if (!fileData.indices || fileData.indices.length === 0) {
                    this.showUploadStatus('No data to export', 'error');
                    return;
                }

                // Convert to CSV format
                const headers = ['Name', 'LTP', 'Change', 'Change(%)'];
                const csvRows = [headers.join(',')];

                fileData.indices.forEach(index => {
                    const row = [
                        index.symbol || '',
                        index.lastPrice || 0,
                        index.change || 0,
                        index.pChange || 0
                    ];
                    csvRows.push(row.join(','));
                });

                const csvContent = csvRows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `${fileData.fileName || `export_${date}.csv`}`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                this.showUploadStatus('CSV exported successfully', 'success');
            } else {
                this.showUploadStatus('File not found', 'error');
            }
        } catch (error) {
            console.error('Error exporting CSV:', error);
            this.showUploadStatus('Error exporting CSV', 'error');
        }
    }

    async deleteUploadedFile(fileId, type = 'indices') {
        try {
            const response = await fetch(`/api/save-uploaded-data?id=${fileId}&type=${type}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                // Refresh the table
                this.updateUploadedDataInfo();
                // Also check if we need to hide date picker (refresh available dates)
                await this.checkAndShowDatePicker();
                // If deleted file was the current one, reload data
                const currentData = this.getUploadedData();
                if (currentData && currentData.source === 'database') {
                    this.loadData();
                }
            } else {
                this.showUploadStatus(result.message || 'Error deleting file', 'error');
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            this.showUploadStatus('Error deleting file', 'error');
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

    openUploadModal() {
        const uploadModal = document.getElementById('uploadModal');
        if (uploadModal) {
            uploadModal.classList.add('show');
            this.lockBodyScroll();
            this.updateUploadedDataInfo();
        }
    }

    lockBodyScroll() {
        document.body.classList.add('body-scroll-lock');
    }

    unlockBodyScroll() {
        document.body.classList.remove('body-scroll-lock');
    }

    updateLogoutButton() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (this.logoutMenuBtn) {
            this.logoutMenuBtn.style.display = isLoggedIn ? 'flex' : 'none';
        }
    }

    handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('loginMethod');
            // Close menu modal
            if (this.menuModal) {
                this.menuModal.classList.remove('show');
                this.unlockBodyScroll();
            }
            window.location.href = '/login.html';
        }
    }

    openMenuModal() {
        if (this.menuModal) {
            this.menuModal.classList.add('show');
            this.lockBodyScroll();
        }
    }

    setupMenuModal() {
        const closeMenu = document.getElementById('closeMenu');
        
        if (closeMenu && this.menuModal) {
            closeMenu.addEventListener('click', () => {
                this.menuModal.classList.remove('show');
                this.unlockBodyScroll();
            });
        }

        // Close on backdrop click
        if (this.menuModal) {
            this.menuModal.addEventListener('click', (e) => {
                if (e.target === this.menuModal) {
                    this.menuModal.classList.remove('show');
                    this.unlockBodyScroll();
                }
            });
        }
    }

    openAiConnectModal() {
        // Close menu modal first
        if (this.menuModal) {
            this.menuModal.classList.remove('show');
        }
        
        // Open AI Connect modal
        if (this.aiConnectModal) {
            this.aiConnectModal.classList.add('show');
            this.lockBodyScroll();
            
            // Load saved API key
            this.loadOpenRouterKey();
        }
    }

    setupAiConnectModal() {
        const closeAiConnect = document.getElementById('closeAiConnect');
        const cancelAiConnect = document.getElementById('cancelAiConnect');
        const saveAiConnect = document.getElementById('saveAiConnect');
        
        if (closeAiConnect && this.aiConnectModal) {
            closeAiConnect.addEventListener('click', () => {
                this.aiConnectModal.classList.remove('show');
                this.unlockBodyScroll();
            });
        }

        if (cancelAiConnect && this.aiConnectModal) {
            cancelAiConnect.addEventListener('click', () => {
                this.aiConnectModal.classList.remove('show');
                this.unlockBodyScroll();
            });
        }

        if (saveAiConnect) {
            saveAiConnect.addEventListener('click', () => this.saveOpenRouterKey());
        }

        // Close on backdrop click
        if (this.aiConnectModal) {
            this.aiConnectModal.addEventListener('click', (e) => {
                if (e.target === this.aiConnectModal) {
                    this.aiConnectModal.classList.remove('show');
                    this.unlockBodyScroll();
                }
            });
        }
    }

    loadOpenRouterKey() {
        const openRouterKeyInput = document.getElementById('openRouterKey');
        if (openRouterKeyInput) {
            // Load from settings or localStorage
            let savedKey = '';
            if (window.settingsManager) {
                const settings = window.settingsManager.settings;
                if (settings && settings.openRouterKey) {
                    savedKey = settings.openRouterKey;
                }
            }
            
            // Fallback to localStorage
            if (!savedKey) {
                savedKey = localStorage.getItem('openRouterApiKey') || '';
            }
            
            openRouterKeyInput.value = savedKey;
        }
    }

    saveOpenRouterKey() {
        const openRouterKeyInput = document.getElementById('openRouterKey');
        const statusEl = document.getElementById('aiConnectStatus');
        
        if (!openRouterKeyInput) return;

        const apiKey = openRouterKeyInput.value.trim();

        if (!apiKey) {
            this.showAiConnectStatus('Please enter an API key', 'error');
            return;
        }

        // Validate API key format (basic check - OpenRouter keys typically start with 'sk-or-')
        if (!apiKey.startsWith('sk-or-') && apiKey.length < 20) {
            this.showAiConnectStatus('Invalid API key format. OpenRouter keys typically start with "sk-or-"', 'error');
            return;
        }

        // Save to settings
        if (window.settingsManager) {
            if (!window.settingsManager.settings) {
                window.settingsManager.settings = {};
            }
            window.settingsManager.settings.openRouterKey = apiKey;
            window.settingsManager.saveSettings();
        }

        // Also save to localStorage as backup
        localStorage.setItem('openRouterApiKey', apiKey);

        this.showAiConnectStatus('API key saved successfully!', 'success');

        // Close modal after 1.5 seconds
        setTimeout(() => {
            if (this.aiConnectModal) {
                this.aiConnectModal.classList.remove('show');
                this.unlockBodyScroll();
            }
        }, 1500);
    }

    showAiConnectStatus(message, type) {
        const statusEl = document.getElementById('aiConnectStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `upload-status ${type}`;
            statusEl.style.display = 'block';

            // Auto-hide after 5 seconds
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }

    handleSignals() {
        // Show all indices section when Signals button is clicked
        const allIndicesSection = document.getElementById('allIndicesSection');
        if (allIndicesSection) {
            allIndicesSection.style.display = 'block';
            // Scroll to the section
            allIndicesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    updateDataSourceDisplay(source, data = null) {
        const dataSource = document.getElementById('dataSource');
        const updateInfo = document.getElementById('updateInfo');

        // Always show minimal message: "NSE India • Updates every 30 sec. during market hrs."
        if (dataSource) {
            dataSource.textContent = 'NSE India';
        }
        if (updateInfo) {
            updateInfo.textContent = 'Updates every 30 sec. during market hrs.';
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