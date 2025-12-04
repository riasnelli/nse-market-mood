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
            if (provider === 'dhan') {
                this.apiUrl = '/api/dhan-data';
            } else {
                // For NSE, get the base URL from settings and pass it as query param
                const nseApi = window.settingsManager.settings?.apis?.nse;
                const baseUrl = nseApi?.config?.baseUrl || 'https://www.nseindia.com/api';
                this.apiUrl = `/api/nse-data?baseUrl=${encodeURIComponent(baseUrl)}`;
            }
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

            // Calculate if we're at the bottom
            const windowHeight = window.innerHeight || document.documentElement.clientHeight;
            const documentHeight = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
            );
            
            // Check if we're near the bottom (within 50px)
            const isAtBottom = scrollTop + windowHeight >= documentHeight - 50;
            
            // Check if we're at the top
            const isAtTop = scrollTop <= 10;

            // Determine scroll direction and handle footer visibility
            if (isAtBottom) {
                // At bottom - always show footer
                footer.classList.remove('hidden');
            } else if (isAtTop) {
                // At top - always show footer
                footer.classList.remove('hidden');
            } else if (scrollTop > lastScrollTop && scrollTop > 100) {
                // Scrolling down (and not at top/bottom) - hide footer
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

        // Add scroll listener to window - always active
        window.addEventListener('scroll', throttledScroll, { passive: true });

        // Also handle scroll on the container if it's scrollable
        const container = document.querySelector('.container');
        if (container) {
            container.addEventListener('scroll', throttledScroll, { passive: true });
        }

        // Also handle scroll on main element if it's scrollable
        const main = document.querySelector('main');
        if (main) {
            main.addEventListener('scroll', throttledScroll, { passive: true });
        }

        // Also handle scroll on body if it's scrollable
        document.body.addEventListener('scroll', throttledScroll, { passive: true });

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
        console.log('🚀 MarketMoodApp.init() called - Initializing app...');
        console.log('Document ready state:', document.readyState);
        console.log('Window location:', window.location.pathname);
        
        // Immediate check for signalsPageView element
        const testSignalsPage = document.getElementById('signalsPageView');
        console.log('🔍 Immediate signalsPageView check:', !!testSignalsPage, testSignalsPage);
        if (!testSignalsPage) {
            console.error('⚠️ CRITICAL: signalsPageView element not found in DOM!');
            console.error('Checking all page-view elements:', document.querySelectorAll('.page-view'));
            console.error('Checking main element:', document.querySelector('main'));
        }
        
        // Immediately update theme color on init for PWA mode
        // This ensures Dynamic Island area has correct color from start
        const initialColor = getComputedStyle(document.documentElement).getPropertyValue('--mood-bg-color').trim() || '#667eea';
        this.updateThemeColor(initialColor);
        
        this.updateTimeEl = document.getElementById('updateTime');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.moodBtn = document.getElementById('moodBtn');
        this.moodBtnLabel = document.getElementById('moodBtnLabel');
        this.signalsBtn = document.getElementById('signalsBtn');
        this.signalsBtnLabel = document.getElementById('signalsBtnLabel');
        this.generateSignalsBtn = document.getElementById('generateSignalsBtn');
        this.refreshDataAvailabilityBtn = document.getElementById('refreshDataAvailabilityBtn');
        this.dataAvailabilitySection = document.getElementById('dataAvailabilitySection');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.moodPageView = document.getElementById('moodPageView');
        this.signalsPageView = document.getElementById('signalsPageView');
        this.currentView = 'mood'; // 'mood' or 'signals'
        
        console.log('🔍 Element check:', {
            signalsBtn: !!this.signalsBtn,
            signalsBtnLabel: !!this.signalsBtnLabel,
            moodPageView: !!this.moodPageView,
            signalsPageView: !!this.signalsPageView
        });
        
        // If signalsPageView not found, try multiple methods to find it
        if (!this.signalsPageView) {
            console.warn('⚠️ signalsPageView not found, trying alternative methods...');
            this.signalsPageView = document.querySelector('#signalsPageView');
            if (!this.signalsPageView) {
                const main = document.querySelector('main');
                if (main) {
                    this.signalsPageView = main.querySelector('#signalsPageView');
                }
            }
            if (!this.signalsPageView) {
                const allPageViews = document.querySelectorAll('.page-view');
                for (const el of allPageViews) {
                    if (el.id === 'signalsPageView') {
                        this.signalsPageView = el;
                        break;
                    }
                }
            }
            if (this.signalsPageView) {
                console.log('✓ Found signalsPageView using fallback method');
            } else {
                console.error('✗ signalsPageView still not found after all attempts!');
                console.error('Document ready state:', document.readyState);
                console.error('Main element:', document.querySelector('main'));
                console.error('All page-view elements:', document.querySelectorAll('.page-view'));
            }
        }
        
        // Ensure mood page is visible initially
        if (this.moodPageView) {
            this.moodPageView.style.setProperty('display', 'block', 'important');
            console.log('✓ Mood page initialized and visible');
        } else {
            console.error('✗ Mood page view not found during init!');
        }
        if (this.signalsPageView) {
            this.signalsPageView.style.setProperty('display', 'none', 'important');
            console.log('✓ Signals page initialized and hidden');
        } else {
            console.error('✗ Signals page view not found during init!');
            console.error('This will prevent the signals page from working. Please check the HTML structure.');
        }
        
        // Debug: Log all page view elements
        console.log('=== Page View Elements Check ===');
        console.log('moodPageView:', this.moodPageView);
        console.log('signalsPageView:', this.signalsPageView);
        console.log('signalsBtn:', this.signalsBtn);
        console.log('signalsBtnLabel:', this.signalsBtnLabel);
        
        this.menuBtn = document.getElementById('menuBtn');
        this.menuModal = document.getElementById('menuModal');
        this.aiConnectBtn = document.getElementById('aiConnectBtn');
        this.settingsMenuBtn = document.getElementById('settingsMenuBtn');
        this.logoutMenuBtn = document.getElementById('logoutMenuBtn');
        this.aiConnectModal = document.getElementById('aiConnectModal');

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.handleManualRefresh());
        }
        if (this.moodBtn) {
            this.moodBtn.addEventListener('click', () => {
                if (this.currentView !== 'mood') {
                    this.showMoodView();
                }
            });
        }
        if (this.settingsMenuBtn) {
            this.settingsMenuBtn.addEventListener('click', () => {
                // Close menu modal first
                if (this.menuModal) {
                    this.menuModal.classList.remove('show');
                    this.unlockBodyScroll();
                }
                // Open settings modal
                if (window.settingsManager) {
                    window.settingsManager.openSettingsModal();
                }
            });
        }
        if (this.signalsBtn) {
            this.signalsBtn.addEventListener('click', () => {
                if (this.currentView !== 'signals') {
                    this.showSignalsView();
                }
            });
        }
        if (this.generateSignalsBtn) {
            this.generateSignalsBtn.addEventListener('click', () => this.generateSignals());
        }
        if (this.refreshDataAvailabilityBtn) {
            this.refreshDataAvailabilityBtn.addEventListener('click', () => this.loadDataAvailability());
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
        
        // Update AI Connect status on init
        this.updateMenuAiConnectStatus();

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
            
            // Also update signals page mood card if it exists
            this.syncMoodToSignalsPage(data.mood);
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

    syncMoodToSignalsPage(mood) {
        // Sync mood data to signals page mood card
        if (!mood) return;
        
        const signalsMoodEmoji = document.getElementById('signalsMoodEmoji');
        const signalsMoodText = document.getElementById('signalsMoodText');
        const signalsScoreFill = document.getElementById('signalsScoreFill');
        const signalsScoreText = document.getElementById('signalsScoreText');
        
        if (signalsMoodEmoji) signalsMoodEmoji.textContent = mood.emoji || '😐';
        if (signalsMoodText) signalsMoodText.textContent = mood.text || '';
        
        if (signalsScoreFill && typeof mood.score === 'number') {
            const pct = Math.max(0, Math.min(100, mood.score));
            signalsScoreFill.style.width = pct + '%';
        }
        if (signalsScoreText) signalsScoreText.textContent = (mood.score != null) ? `${mood.score}/100` : '-/-';
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
        // Prevent concurrent calls
        if (this._updatingUploadedDataInfo) {
            console.log('updateUploadedDataInfo already in progress, skipping...');
            return;
        }
        
        this._updatingUploadedDataInfo = true;
        
        const uploadedDataInfo = document.getElementById('uploadedDataInfo');
        const tableBody = document.getElementById('uploadedFilesTableBody');
        const loadingEl = document.getElementById('uploadedFilesLoading');
        const emptyEl = document.getElementById('uploadedFilesEmpty');
        const tableEl = document.getElementById('uploadedFilesTable');

        if (!uploadedDataInfo || !tableBody) {
            this._updatingUploadedDataInfo = false;
            return;
        }

        // Show loading state
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (tableEl) tableEl.style.display = 'none';
        
        // Clear table body completely - this is critical to prevent duplicates
        // Remove all child nodes to ensure complete cleanup
        while (tableBody.firstChild) {
            tableBody.removeChild(tableBody.firstChild);
        }
        tableBody.innerHTML = '';
        
        // Debug: Log when function is called
        console.log('updateUploadedDataInfo called');
        console.log('Table body cleared, child count:', tableBody.children.length);

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

            // Debug: Log API responses
            console.log('📥 API Responses:', {
                indices: {
                    success: indicesResult.success,
                    count: indicesResult.data?.length || 0,
                    todayFiles: indicesResult.data?.filter(f => f.date === '2025-12-01') || []
                },
                bhav: {
                    success: bhavResult.success,
                    count: bhavResult.data?.length || 0,
                    todayFiles: bhavResult.data?.filter(f => f.date === '2025-12-01') || []
                },
                premarket: {
                    success: premarketResult.success,
                    count: premarketResult.data?.length || 0,
                    todayFiles: premarketResult.data?.filter(f => f.date === '2025-12-01') || []
                }
            });

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
                        // Always update if count is higher OR if no ID is set yet (file exists)
                        if (count > dateData.bhav.count || !dateData.bhav.id) {
                            dateData.bhav.count = count;
                            dateData.bhav.id = file.id;
                        }
                        // Keep the most recent uploadedAt
                        if (new Date(file.uploadedAt) > new Date(dateData.uploadedAt)) {
                            dateData.uploadedAt = file.uploadedAt;
                        }
                        
                        // Debug log for bhav data
                        if (normalizedDate === '2025-12-01') {
                            console.log('🔍 Bhav data for 2025-12-01:', {
                                fileId: file.id,
                                fileName: file.fileName,
                                indicesCount: file.indicesCount,
                                count: count,
                                dateDataBhavCount: dateData.bhav.count,
                                dateDataBhavId: dateData.bhav.id
                            });
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
                        // For premarket, check multiple possible fields for count
                        // The API might return indicesCount, or the data might be in indices array
                        let count = 0;
                        if (file.indicesCount !== undefined && file.indicesCount !== null) {
                            count = file.indicesCount;
                        } else if (Array.isArray(file.indices) && file.indices.length > 0) {
                            count = file.indices.length;
                        } else if (file.count !== undefined && file.count !== null) {
                            count = file.count;
                        }
                        
                        // Debug log for premarket data
                        if (normalizedDate === '2025-12-01') {
                            console.log('🔍 Premarket data for 2025-12-01:', {
                                fileId: file.id,
                                fileName: file.fileName,
                                indicesCount: file.indicesCount,
                                indicesArray: Array.isArray(file.indices) ? file.indices.length : 'not array',
                                count: count,
                                dateDataPremarketCount: dateData.premarket.count
                            });
                        }
                        
                        // Always update if count is higher OR if no ID is set yet (file exists)
                        if (count > dateData.premarket.count || !dateData.premarket.id) {
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

            // Debug: Log what we have before final processing
            console.log('Date map after processing all types:', Array.from(dateMap.keys()));
            console.log('Date map entries:', Array.from(dateMap.entries()).map(([date, data]) => ({
                date,
                indices: data.indices.count,
                bhav: data.bhav.count,
                premarket: data.premarket.count,
                premarketId: data.premarket.id
            })));
            
            // Special debug for today's date
            const todayData = dateMap.get('2025-12-01');
            if (todayData) {
                console.log('📊 Today (2025-12-01) data summary:', {
                    indices: todayData.indices.count,
                    bhav: todayData.bhav.count,
                    premarket: todayData.premarket.count,
                    premarketId: todayData.premarket.id
                });
            }

            // Use a more robust normalization function
            const normalizeDateForKey = (dateStr) => {
                if (!dateStr) return null;
                // Extract just the date part (YYYY-MM-DD) if it includes time
                let dateOnly = dateStr.toString().split('T')[0].split(' ')[0].trim();
                // Remove any trailing characters
                dateOnly = dateOnly.replace(/[^\d-]/g, '');
                // Validate and normalize format
                if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    return dateOnly;
                }
                // Try to parse and reformat if needed
                try {
                    const dateObj = new Date(dateOnly);
                    if (!isNaN(dateObj.getTime())) {
                        const year = dateObj.getFullYear();
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const day = String(dateObj.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
                return dateOnly;
            };
            
            // Final deduplication - normalize all dates in the map and merge duplicates
            const finalDateMap = new Map();
            
            dateMap.forEach((item, originalDate) => {
                if (!item.date) return;
                
                // Normalize the date key
                const dateKey = normalizeDateForKey(item.date);
                if (!dateKey) {
                    console.warn(`Skipping item with invalid date: ${item.date}`);
                    return;
                }
                
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
                    // Normalize the date in the item as well
                    item.date = dateKey;
                    finalDateMap.set(dateKey, { ...item });
                }
            });
            
            // Convert to array and sort by date descending
            const groupedData = Array.from(finalDateMap.values()).sort((a, b) => {
                return new Date(b.date) - new Date(a.date);
            });
            
            console.log(`Grouped ${groupedData.length} unique dates from all collections:`, groupedData.map(d => d.date));
            console.log('Date map keys:', Array.from(dateMap.keys()));
            console.log('Final date map keys:', Array.from(finalDateMap.keys()));
            
            // Final check: ensure absolutely no duplicates (triple check)
            const uniqueDates = new Set();
            const deduplicatedData = [];
            groupedData.forEach(item => {
                const dateKey = normalizeDateForKey(item.date);
                if (!dateKey) {
                    console.warn(`Skipping item with invalid date: ${item.date}`);
                    return;
                }
                if (!uniqueDates.has(dateKey)) {
                    uniqueDates.add(dateKey);
                    // Ensure date is normalized in the item
                    item.date = dateKey;
                    deduplicatedData.push(item);
                } else {
                    console.warn(`⚠️ Duplicate date found in final array: ${dateKey}, skipping duplicate`);
                }
            });
            
            // Use deduplicated data - this should be the final, unique list
            const finalGroupedData = deduplicatedData;
            
            console.log(`Final unique dates count: ${finalGroupedData.length}`);
            console.log('Final dates:', finalGroupedData.map(d => d.date));

            if (finalGroupedData.length > 0) {
                // Show table and hide empty message
                if (tableEl) tableEl.style.display = 'table';
                if (emptyEl) emptyEl.style.display = 'none';
                uploadedDataInfo.style.display = 'block';

                // Populate table - final check to ensure no duplicates
                const addedDates = new Set();
                let rowNumber = 0; // Track row number separately
                
                // Sort by date descending one more time to ensure consistency
                const sortedData = [...finalGroupedData].sort((a, b) => {
                    const dateA = normalizeDateForKey(a.date) || '';
                    const dateB = normalizeDateForKey(b.date) || '';
                    return dateB.localeCompare(dateA);
                });
                
                sortedData.forEach((dateData, index) => {
                    // Normalize date one more time before checking
                    const normalizedDate = normalizeDateForKey(dateData.date);
                    if (!normalizedDate) {
                        console.warn(`Skipping item with invalid date: ${dateData.date}`);
                        return;
                    }
                    
                    // Skip if this date was already added (should not happen, but safety check)
                    if (addedDates.has(normalizedDate)) {
                        console.error(`❌ ERROR: Duplicate date found during table rendering: ${normalizedDate}`);
                        console.error('This should not happen. Date data:', dateData);
                        console.error('Already added dates:', Array.from(addedDates));
                        return;
                    }
                    
                    // Mark this date as added BEFORE creating the row
                    addedDates.add(normalizedDate);
                    
                    // Update dateData.date to normalized version
                    dateData.date = normalizedDate;
                    
                    // Increment row number only for valid, unique dates
                    rowNumber++;
                    
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
                    // Show checkmark if count > 0 OR if a file was uploaded (has an ID that is not null/undefined/empty)
                    const hasBhav = (dateData.bhav?.count || 0) > 0 || (dateData.bhav?.id && dateData.bhav.id !== null && dateData.bhav.id !== undefined && dateData.bhav.id !== '');
                    const hasPremarket = (dateData.premarket?.count || 0) > 0 || (dateData.premarket?.id && dateData.premarket.id !== null && dateData.premarket.id !== undefined && dateData.premarket.id !== '');
                    
                    // Debug log for today's date
                    if (normalizedDate === '2025-12-01') {
                        console.log('🎯 Rendering row for 2025-12-01:', {
                            dateData: {
                                indices: { count: dateData.indices?.count, id: dateData.indices?.id },
                                bhav: { count: dateData.bhav?.count, id: dateData.bhav?.id },
                                premarket: { count: dateData.premarket?.count, id: dateData.premarket?.id }
                            },
                            hasBhav,
                            hasPremarket,
                            bhavCheck: {
                                countCheck: (dateData.bhav?.count || 0) > 0,
                                idCheck: dateData.bhav?.id && dateData.bhav.id !== null && dateData.bhav.id !== undefined && dateData.bhav.id !== '',
                                idValue: dateData.bhav?.id
                            },
                            premarketCheck: {
                                countCheck: (dateData.premarket?.count || 0) > 0,
                                idCheck: dateData.premarket?.id && dateData.premarket.id !== null && dateData.premarket.id !== undefined && dateData.premarket.id !== '',
                                idValue: dateData.premarket?.id
                            }
                        });
                    }
                    
                    // Use green checkmark for better visibility
                    const checkmarkColor = '#10b981'; // Green color
                    const checkmark = '✓';
                    
                    row.innerHTML = `
                        <td>${rowNumber}</td>
                        <td style="color: ${dateColor};">${formattedDate}</td>
                        <td style="color: ${(dateData.indices?.count || 0) > 0 ? dateColor : '#999'};">${dateData.indices?.count || 0}</td>
                        <td style="color: ${hasBhav ? checkmarkColor : '#999'}; text-align: center; font-weight: ${hasBhav ? 'bold' : 'normal'}; font-size: ${hasBhav ? '1.2em' : '1em'};">${hasBhav ? checkmark : ''}</td>
                        <td style="color: ${hasPremarket ? checkmarkColor : '#999'}; text-align: center; font-weight: ${hasPremarket ? 'bold' : 'normal'}; font-size: ${hasPremarket ? '1.2em' : '1em'};">${hasPremarket ? checkmark : ''}</td>
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
                    
                    // Final check before appending - ensure this date hasn't been added
                    const existingRows = Array.from(tableBody.querySelectorAll('tr'));
                    const dateAlreadyInTable = existingRows.some(tr => {
                        const dateCell = tr.querySelector('td:nth-child(2)');
                        if (dateCell) {
                            const cellText = dateCell.textContent.trim();
                            // Extract date from formatted text (DD/MM format)
                            const cellDateParts = cellText.split('/');
                            if (cellDateParts.length === 2) {
                                const [day, month] = cellDateParts;
                                const cellDateKey = `${dateData.date.split('-')[0]}-${month}-${day}`;
                                return cellDateKey === normalizedDate || 
                                       cellText === formattedDate ||
                                       dateCell.textContent.includes(formattedDate);
                            }
                        }
                        return false;
                    });
                    
                    if (dateAlreadyInTable) {
                        console.error(`❌ CRITICAL: Attempted to add duplicate row for date ${normalizedDate}`);
                        console.error('Existing rows:', existingRows.length);
                        return; // Skip adding this row
                    }
                    
                    tableBody.appendChild(row);
                    console.log(`Added row ${rowNumber} for date: ${normalizedDate}`);
                });
                
                // Final verification - check for any duplicates in the rendered table
                const finalRows = Array.from(tableBody.querySelectorAll('tr'));
                const finalDates = new Set();
                finalRows.forEach((row, idx) => {
                    const dateCell = row.querySelector('td:nth-child(2)');
                    if (dateCell) {
                        const dateText = dateCell.textContent.trim();
                        if (finalDates.has(dateText)) {
                            console.error(`❌ DUPLICATE ROW DETECTED at index ${idx}: ${dateText}`);
                            row.remove(); // Remove the duplicate
                        } else {
                            finalDates.add(dateText);
                        }
                    }
                });
                
                console.log(`Final table has ${tableBody.children.length} unique rows`);

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
        } finally {
            // Always clear the flag when done
            this._updatingUploadedDataInfo = false;
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
        // Update AI Connect status when menu opens
        this.updateMenuAiConnectStatus();
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
            
            // Load saved API key and update status
            this.loadOpenRouterKey();
            this.updateAiConnectStatus();
        }
    }

    setupAiConnectModal() {
        const closeAiConnect = document.getElementById('closeAiConnect');
        const cancelAiConnect = document.getElementById('cancelAiConnect');
        const saveAiConnect = document.getElementById('saveAiConnect');
        const deleteAiConnectBtn = document.getElementById('deleteAiConnectBtn');
        
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

        if (deleteAiConnectBtn) {
            deleteAiConnectBtn.addEventListener('click', () => this.deleteOpenRouterKey());
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
        
        // Update status display
        this.updateAiConnectStatus();
        
        // Update menu status
        this.updateMenuAiConnectStatus();

        // Close modal after 1.5 seconds
        setTimeout(() => {
            if (this.aiConnectModal) {
                this.aiConnectModal.classList.remove('show');
                this.unlockBodyScroll();
            }
        }, 1500);
    }

    deleteOpenRouterKey() {
        if (!confirm('Are you sure you want to delete the OpenRouter API key? This will disconnect AI features.')) {
            return;
        }

        // Remove from settings
        if (window.settingsManager) {
            if (window.settingsManager.settings) {
                window.settingsManager.settings.openRouterKey = '';
                window.settingsManager.saveSettings();
            }
        }

        // Remove from localStorage
        localStorage.removeItem('openRouterApiKey');

        // Clear input field
        const openRouterKeyInput = document.getElementById('openRouterKey');
        if (openRouterKeyInput) {
            openRouterKeyInput.value = '';
        }

        // Update status display
        this.updateAiConnectStatus();
        
        // Update menu status
        this.updateMenuAiConnectStatus();

        this.showAiConnectStatus('API key deleted successfully', 'success');
    }

    updateAiConnectStatus() {
        const statusInfo = document.getElementById('aiConnectStatusInfo');
        const statusBadge = document.getElementById('aiConnectStatusBadge');
        const keyPreview = document.getElementById('aiConnectKeyPreview');
        
        // Get saved API key
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

        if (savedKey && savedKey.trim()) {
            // Show connected status
            if (statusInfo) {
                statusInfo.style.display = 'block';
            }
            if (statusBadge) {
                statusBadge.style.display = 'flex';
            }
            
            // Show masked key preview
            if (keyPreview) {
                const maskedKey = savedKey.length > 8 
                    ? savedKey.substring(0, 8) + '•'.repeat(Math.min(savedKey.length - 8, 12))
                    : '•'.repeat(12);
                keyPreview.textContent = `Key: ${maskedKey}`;
            }
        } else {
            // Hide connected status
            if (statusInfo) {
                statusInfo.style.display = 'none';
            }
            if (statusBadge) {
                statusBadge.style.display = 'none';
            }
        }
    }

    updateMenuAiConnectStatus() {
        const aiConnectBtn = document.getElementById('aiConnectBtn');
        if (!aiConnectBtn) return;

        // Get saved API key
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

        // Remove existing status indicator first
        const existingIndicator = aiConnectBtn.querySelector('.ai-connect-status-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Find the span element and arrow SVG in the button
        const spanElement = aiConnectBtn.querySelector('span');
        const arrowSvg = aiConnectBtn.querySelector('svg:last-child');
        
        if (spanElement) {
            if (savedKey && savedKey.trim()) {
                // Add status indicator between span and arrow
                const statusIndicator = document.createElement('span');
                statusIndicator.className = 'ai-connect-status-indicator';
                statusIndicator.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span class="ai-connect-status-text">Connected</span>
                `;
                
                // Insert before the arrow SVG, or after span if no arrow
                if (arrowSvg && arrowSvg !== spanElement.nextElementSibling) {
                    // Arrow is the last child, insert before it
                    aiConnectBtn.insertBefore(statusIndicator, arrowSvg);
                } else {
                    // Insert after span
                    spanElement.parentNode.insertBefore(statusIndicator, spanElement.nextSibling);
                }
            }
        }
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

    toggleView() {
        // Prevent any default scrolling behavior
        if (document.activeElement) {
            document.activeElement.blur();
        }
        
        if (this.currentView === 'mood') {
            // Switch to Signals view
            this.showSignalsView();
        } else {
            // Switch to Mood view
            this.showMoodView();
        }
    }

    showMoodView() {
        console.log('Switching to Mood view');
        this.currentView = 'mood';
        
        // Hide signals page, show mood page
        if (this.signalsPageView) {
            this.signalsPageView.style.setProperty('display', 'none', 'important');
        }
        if (this.moodPageView) {
            this.moodPageView.style.setProperty('display', 'block', 'important');
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showSignalsView() {
        console.log('=== Switching to Signals view ===');
        console.log('Mood page view element:', this.moodPageView);
        console.log('Signals page view element:', this.signalsPageView);
        
        // Re-query elements if they're not found (in case DOM changed)
        if (!this.moodPageView) {
            this.moodPageView = document.getElementById('moodPageView');
            console.log('Re-queried moodPageView:', this.moodPageView);
        }
        if (!this.signalsPageView) {
            this.signalsPageView = document.getElementById('signalsPageView');
            console.log('Re-queried signalsPageView:', this.signalsPageView);
        }
        
        // If still not found, try querySelector as fallback
        if (!this.signalsPageView) {
            this.signalsPageView = document.querySelector('#signalsPageView');
            console.log('Tried querySelector for signalsPageView:', this.signalsPageView);
        }
        
        // If still not found, check if main element exists and search within it
        if (!this.signalsPageView) {
            const main = document.querySelector('main');
            if (main) {
                this.signalsPageView = main.querySelector('#signalsPageView');
                console.log('Searched within main element:', this.signalsPageView);
            }
        }
        
        // Last resort: check all page-view elements
        if (!this.signalsPageView) {
            const allPageViews = document.querySelectorAll('.page-view');
            console.log('All page-view elements found:', allPageViews.length);
            allPageViews.forEach((el, idx) => {
                console.log(`Page view ${idx}: id="${el.id}", display="${getComputedStyle(el).display}"`);
                if (el.id === 'signalsPageView') {
                    this.signalsPageView = el;
                    console.log('Found signalsPageView in page-view list!');
                }
            });
        }
        
        if (!this.moodPageView || !this.signalsPageView) {
            console.error('Page view elements not found! Cannot switch views.');
            console.error('moodPageView:', this.moodPageView);
            console.error('signalsPageView:', this.signalsPageView);
            console.error('Document body:', document.body);
            console.error('Main element:', document.querySelector('main'));
            console.error('All elements with id signalsPageView:', document.querySelectorAll('#signalsPageView'));
            alert('Error: Signals page elements not found. Please refresh the page.');
            return;
        }
        
        this.currentView = 'signals';
        
        // Hide mood page first - use setProperty for better compatibility
        // CRITICAL: Ensure mood page is completely hidden
        this.moodPageView.style.setProperty('display', 'none', 'important');
        this.moodPageView.style.setProperty('visibility', 'hidden', 'important');
        this.moodPageView.classList.add('hidden');
        // Force reflow to ensure the change takes effect
        void this.moodPageView.offsetHeight;
        console.log('Mood page hidden, computed display:', getComputedStyle(this.moodPageView).display);
        
        // Show signals page - use multiple methods to ensure it displays
        // Method 1: Remove inline style completely
        this.signalsPageView.removeAttribute('style');
        
        // Method 2: Set display using cssText to override everything
        this.signalsPageView.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; width: 100% !important; height: auto !important; min-height: 100vh !important;';
        
        // Method 3: Also set individual properties
        this.signalsPageView.style.setProperty('display', 'block', 'important');
        this.signalsPageView.style.setProperty('visibility', 'visible', 'important');
        this.signalsPageView.style.setProperty('opacity', '1', 'important');
        this.signalsPageView.style.setProperty('position', 'relative', 'important');
        
        // Method 4: Remove any hidden class
        this.signalsPageView.classList.remove('hidden');
        
        console.log('Signals page style set to block');
        
        // Force multiple reflows to ensure display change takes effect
        void this.signalsPageView.offsetHeight;
        void this.signalsPageView.offsetWidth;
        void this.signalsPageView.getBoundingClientRect();
        
        // Verify it's visible
        const computedDisplay = getComputedStyle(this.signalsPageView).display;
        const computedVisibility = getComputedStyle(this.signalsPageView).visibility;
        const rect = this.signalsPageView.getBoundingClientRect();
        console.log('Signals page computed styles - display:', computedDisplay, 'visibility:', computedVisibility);
        console.log('Signals page bounding rect:', rect);
        
        if (computedDisplay === 'none') {
            console.error('Signals page still hidden! Trying alternative method...');
            // Try using classList manipulation
            this.signalsPageView.classList.remove('hidden');
            this.signalsPageView.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; position: relative !important;';
            void this.signalsPageView.offsetHeight;
        }
        
        // Double-check visibility
        const finalDisplay = getComputedStyle(this.signalsPageView).display;
        if (finalDisplay === 'none') {
            console.error('CRITICAL: Signals page still not visible after all attempts!');
            console.error('Element:', this.signalsPageView);
            console.error('Parent:', this.signalsPageView.parentElement);
            console.error('All computed styles:', window.getComputedStyle(this.signalsPageView));
        } else {
            console.log('✓ Signals page is now visible');
        }
        
        // Copy mood data to signals page mood card
        // Get current mood data from the main page
        const moodEmoji = document.getElementById('moodEmoji');
        const moodText = document.getElementById('moodText');
        const scoreText = document.getElementById('scoreText');
        if (moodEmoji && moodText && scoreText) {
            const mood = {
                emoji: moodEmoji.textContent || '😐',
                text: moodText.textContent || '',
                score: scoreText.textContent ? parseInt(scoreText.textContent.split('/')[0]) : null
            };
            this.syncMoodToSignalsPage(mood);
        }
        
        // Immediately scroll to top to prevent any unwanted scrolling
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        // Ensure signals section is visible
        const signalsSection = document.getElementById('signalsSection');
        if (signalsSection) {
            signalsSection.style.display = 'block';
            signalsSection.style.visibility = 'visible';
        }
        
        // Wait a bit to ensure the view is actually visible before doing anything else
        setTimeout(() => {
            // Verify signals page is visible
            const finalCheck = getComputedStyle(this.signalsPageView).display;
            const signalsPageRect = this.signalsPageView.getBoundingClientRect();
            console.log('Signals page visibility check:', {
                display: finalCheck,
                rect: signalsPageRect,
                width: signalsPageRect.width,
                height: signalsPageRect.height
            });
            
            if (finalCheck !== 'none' && signalsPageRect.height > 0) {
                // Ensure we're at the top
                window.scrollTo({ top: 0, behavior: 'instant' });
                console.log('✓ Signals page is visible and has content, staying at top');
            } else {
                console.error('Signals page not visible after switch! Attempting aggressive fix...');
                
                // Aggressive fix - try everything
                this.signalsPageView.classList.remove('hidden');
                this.signalsPageView.removeAttribute('style');
                this.signalsPageView.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; width: 100% !important;';
                
                // Force multiple reflows
                void this.signalsPageView.offsetHeight;
                void this.signalsPageView.offsetWidth;
                void this.signalsPageView.getBoundingClientRect();
                
                // Also check parent
                const parent = this.signalsPageView.parentElement;
                if (parent) {
                    parent.style.setProperty('display', 'block', 'important');
                }
                
                window.scrollTo({ top: 0, behavior: 'instant' });
                
                // Wait a bit and check again
                setTimeout(() => {
                    const retryCheck = getComputedStyle(this.signalsPageView).display;
                    const retryRect = this.signalsPageView.getBoundingClientRect();
                    console.log('After aggressive fix attempt:', {
                        display: retryCheck,
                        rect: retryRect,
                        visible: retryCheck !== 'none' && retryRect.height > 0
                    });
                    
                    if (retryCheck === 'none' || retryRect.height === 0) {
                        console.error('CRITICAL: Signals page still not visible!');
                        // Show error message in the UI instead of alert
                        const signalsError = document.getElementById('signalsError');
                        if (signalsError) {
                            signalsError.style.display = 'block';
                            signalsError.textContent = 'Signals page failed to load. Please refresh the page.';
                        } else {
                            // Fallback to alert if error element doesn't exist
                            alert('Signals page failed to load. Please refresh the page.');
                        }
                    }
                }, 100);
            }
            
            // Load data availability and signals
            console.log('Loading data availability...');
            this.loadDataAvailability();
            
            console.log('Loading signals...');
            this.loadSignals();
        }, 100);
        
        console.log('=== Signals view switch complete ===');
    }


    async loadSignals(date = null) {
        console.log('Loading signals, date:', date);
        
        // Wait a bit to ensure page view is visible
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const signalsSection = document.getElementById('signalsSection');
        const signalsContainer = document.getElementById('signalsContainer');
        const signalsLoading = document.getElementById('signalsLoading');
        const signalsError = document.getElementById('signalsError');
        const signalsEmpty = document.getElementById('signalsEmpty');

        console.log('Looking for signals elements:', {
            signalsSection: !!signalsSection,
            signalsContainer: !!signalsContainer,
            signalsLoading: !!signalsLoading,
            signalsError: !!signalsError,
            signalsEmpty: !!signalsEmpty,
            signalsPageViewVisible: this.signalsPageView ? getComputedStyle(this.signalsPageView).display : 'N/A'
        });

        if (!signalsSection || !signalsContainer) {
            console.error('Signals section or container not found!', { 
                signalsSection, 
                signalsContainer,
                signalsPageView: this.signalsPageView,
                signalsPageViewDisplay: this.signalsPageView ? getComputedStyle(this.signalsPageView).display : 'N/A'
            });
            
            // Try to find elements again after a delay
            setTimeout(() => {
                const retrySection = document.getElementById('signalsSection');
                const retryContainer = document.getElementById('signalsContainer');
                if (retrySection && retryContainer) {
                    console.log('Found elements on retry, loading signals...');
                    this.loadSignals(date);
                } else {
                    console.error('Still not found on retry');
                }
            }, 200);
            return;
        }
        
        console.log('Signals elements found, proceeding with load');

        // Show loading
        signalsLoading.style.display = 'block';
        signalsError.style.display = 'none';
        signalsEmpty.style.display = 'none';
        signalsContainer.style.display = 'none';
        signalsContainer.innerHTML = '';

        try {
            console.log('Loading signals, date:', date);
            // First try to get existing signals
            let url = '/api/get-signals';
            if (date) {
                url = `/api/get-signals?date=${date}`;
            }

            console.log('Fetching from:', url);
            let response = await fetch(url);
            
            if (!response.ok) {
                // If 404, try to generate signals instead
                if (response.status === 404) {
                    console.warn('Signals API endpoint not found (404). Attempting to generate signals...');
                    // Try generating signals instead
                    try {
                        const generateResponse = await fetch('/api/test-generate-signals');
                        if (generateResponse.ok) {
                            const generateData = await generateResponse.json();
                            console.log('Generated signals successfully:', generateData);
                            // Render the generated signals
                            if (generateData.signals && generateData.signals.length > 0) {
                                this.renderSignals(generateData.signals, generateData.run_id, generateData.date || generateData.premarket_date);
                                return;
                            } else {
                                throw new Error('No signals generated');
                            }
                        } else {
                            throw new Error('Failed to generate signals');
                        }
                    } catch (genError) {
                        console.error('Error generating signals:', genError);
                        throw new Error('Signals API not available and generation failed. Please check deployment.');
                    }
                }
                // Try to get error message from response
                let errorText = '';
                try {
                    errorText = await response.text();
                    // If it's HTML (like a 404 page), don't try to parse as JSON
                    if (errorText.startsWith('<') || errorText.startsWith('The page')) {
                        throw new Error(`API endpoint returned HTML instead of JSON (${response.status})`);
                    }
                } catch (e) {
                    throw new Error(`Failed to fetch signals: ${response.status} ${response.statusText}`);
                }
            }
            
            let data = await response.json();
            console.log('Get signals response:', data);

            // If no signals found, generate new ones
            if (!data.signals || data.signals.length === 0) {
                console.log('No existing signals found, generating new ones...');
                // Try to generate signals
                let generateUrl = '/api/test-generate-signals';
                if (date) {
                    generateUrl = `/api/generate-signals?date=${date}`;
                }
                
                console.log('Generating signals from:', generateUrl);
                response = await fetch(generateUrl);
                data = await response.json();
                console.log('Generate signals response:', data);
            }

            signalsLoading.style.display = 'none';

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to load signals');
            }

            if (data.signal_count === 0 || !data.signals || data.signals.length === 0) {
                signalsEmpty.style.display = 'block';
                signalsContainer.style.display = 'none';
                
                // Update the message in the empty state div (keep the HTML structure)
                const emptyTitle = signalsEmpty.querySelector('div[style*="font-size: 1.2rem"]');
                const emptyMessage = signalsEmpty.querySelector('div[style*="font-size: 0.95rem"]');
                
                if (emptyTitle) {
                    emptyTitle.textContent = 'No Potential Signals';
                }
                if (emptyMessage) {
                    if (data.message) {
                        emptyMessage.innerHTML = data.message;
                    } else {
                        emptyMessage.innerHTML = 'No trading signals were found for the selected date.<br>This could mean the market conditions don\'t meet the signal criteria.';
                    }
                }
                
                // Setup generate button in empty state
                const generateBtnEmpty = document.getElementById('generateSignalsBtnEmpty');
                if (generateBtnEmpty) {
                    generateBtnEmpty.onclick = () => {
                        this.generateSignals();
                    };
                }
                
                console.log('No signals found, showing empty message');
                return;
            }
            
            // Hide empty message if we have signals
            signalsEmpty.style.display = 'none';
            signalsContainer.style.display = 'block';

            // Display signals
            console.log('Rendering signals:', data.signals.length);
            signalsContainer.style.display = 'block';
            this.renderSignals(data.signals, data.run_id, data.date);
        } catch (error) {
            console.error('Error loading signals:', error);
            signalsLoading.style.display = 'none';
            signalsError.style.display = 'block';
            signalsContainer.style.display = 'none';
            signalsEmpty.style.display = 'none';
            
            let errorMessage = error.message || 'Failed to load signals. Please try again.';
            if (error.message && error.message.includes('fetch')) {
                errorMessage = 'Network error: Could not connect to the server. Please check your connection and try again.';
            }
            signalsError.textContent = errorMessage;
            console.error('Full error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
    }

    async generateSignals() {
        console.log('Generate Signals button clicked');
        
        const signalsSection = document.getElementById('signalsSection');
        const signalsContainer = document.getElementById('signalsContainer');
        const signalsLoading = document.getElementById('signalsLoading');
        const signalsError = document.getElementById('signalsError');
        const signalsEmpty = document.getElementById('signalsEmpty');

        if (!signalsSection || !signalsContainer) {
            console.error('Signals section or container not found!');
            return;
        }

        // Show loading
        signalsLoading.style.display = 'block';
        signalsError.style.display = 'none';
        signalsEmpty.style.display = 'none';
        signalsContainer.style.display = 'none';
        signalsContainer.innerHTML = '';

        try {
            // Generate signals for the latest date
            console.log('Generating signals for latest date...');
            const response = await fetch('/api/test-generate-signals');
            const data = await response.json();
            console.log('Generate signals response:', data);

            signalsLoading.style.display = 'none';

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to generate signals');
            }

            if (data.signal_count === 0 || !data.signals || data.signals.length === 0) {
                signalsEmpty.style.display = 'block';
                signalsContainer.style.display = 'none';
                
                // Update the message
                const emptyTitle = signalsEmpty.querySelector('div[style*="font-size: 1.2rem"]');
                const emptyMessage = signalsEmpty.querySelector('div[style*="font-size: 0.95rem"]');
                
                if (emptyTitle) {
                    emptyTitle.textContent = 'No Potential Signals';
                }
                if (emptyMessage) {
                    emptyMessage.innerHTML = 'No trading signals were generated for this date.<br>This could mean the market conditions don\'t meet the signal criteria.';
                }
                
                console.log('No signals generated, showing empty message');
                return;
            }

            // Display signals
            console.log('Rendering generated signals:', data.signals.length);
            signalsContainer.style.display = 'block';
            this.renderSignals(data.signals, data.run_id, data.date);
        } catch (error) {
            console.error('Error generating signals:', error);
            signalsLoading.style.display = 'none';
            signalsError.style.display = 'block';
            signalsContainer.style.display = 'none';
            signalsEmpty.style.display = 'none';
            
            let errorMessage = error.message || 'Failed to generate signals. Please try again.';
            if (error.message && error.message.includes('fetch')) {
                errorMessage = 'Network error: Could not connect to the server. Please check your connection and try again.';
            }
            signalsError.textContent = errorMessage;
        }
    }

    renderSignals(signals, runId, date) {
        const signalsContainer = document.getElementById('signalsContainer');
        if (!signalsContainer) return;

        signalsContainer.innerHTML = '';

        // Create header info
        const headerInfo = document.createElement('div');
        headerInfo.style.cssText = 'padding: 15px; background: #f3f4f6; border-radius: 8px; margin-bottom: 15px; font-size: 0.9rem;';
        headerInfo.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <strong>Run ID:</strong> <span style="font-family: monospace; font-size: 0.85rem;">${runId}</span>
                </div>
                <div>
                    <strong>Date:</strong> ${date}
                </div>
                <div>
                    <strong>Signals:</strong> ${signals.length}
                </div>
            </div>
        `;
        signalsContainer.appendChild(headerInfo);

        // Create signals grid
        const signalsGrid = document.createElement('div');
        signalsGrid.className = 'signals-grid';
        signalsGrid.style.cssText = 'display: grid; grid-template-columns: 1fr; gap: 15px;';

        signals.forEach((signal, index) => {
            const signalCard = document.createElement('div');
            signalCard.className = 'signal-card';
            signalCard.style.cssText = `
                background: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            `;

            const isPositive = signal.entry_price && signal.target_price && signal.target_price > signal.entry_price;
            const changeColor = isPositive ? '#10b981' : '#ef4444';

            signalCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                    <div>
                        <h4 style="margin: 0; font-size: 1.1rem; color: #333;">${index + 1}. ${signal.symbol}</h4>
                        <div style="margin-top: 5px; font-size: 0.85rem; color: #666;">
                            Score: <strong style="color: #667eea;">${signal.score}/100</strong>
                            ${signal.confidence_score ? `• Confidence: ${(signal.confidence_score * 100).toFixed(0)}%` : ''}
                        </div>
                    </div>
                    <div style="background: ${isPositive ? '#d1fae5' : '#fee2e2'}; color: ${changeColor}; padding: 6px 12px; border-radius: 20px; font-weight: 600; font-size: 0.9rem;">
                        ${signal.side || 'BUY'}
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 15px;">
                    <div>
                        <div style="font-size: 0.75rem; color: #666; margin-bottom: 5px;">Entry</div>
                        <div style="font-weight: 600; color: #333;">₹${signal.entry_price?.toFixed(2) || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #666; margin-bottom: 5px;">Stop Loss</div>
                        <div style="font-weight: 600; color: #ef4444;">₹${signal.stop_loss?.toFixed(2) || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #666; margin-bottom: 5px;">Target</div>
                        <div style="font-weight: 600; color: #10b981;">₹${signal.target_price?.toFixed(2) || '-'}</div>
                    </div>
                </div>
                ${signal.feature_fields ? `
                    <div style="padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 0.85rem;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; color: #666;">
                            <div>Gap: <strong>${signal.feature_fields.gap_percent?.toFixed(2) || '-'}%</strong></div>
                            <div>RS20: <strong>${signal.feature_fields.rs20?.toFixed(2) || '-'}</strong></div>
                            <div>Vol Surge: <strong>${signal.feature_fields.vol_surge?.toFixed(2) || '-'}x</strong></div>
                            <div>Near High: <strong>${signal.feature_fields.near_high_flag ? 'Yes' : 'No'}</strong></div>
                        </div>
                    </div>
                ` : ''}
                ${signal.ai_explanation ? `
                    <div style="margin-top: 15px; padding: 12px; background: #f9fafb; border-radius: 8px; font-size: 0.85rem; color: #4b5563; border-left: 3px solid #667eea;">
                        ${signal.ai_explanation}
                    </div>
                ` : ''}
            `;

            signalsGrid.appendChild(signalCard);
        });

        signalsContainer.appendChild(signalsGrid);
    }

    async loadDataAvailability(date = null) {
        const dataAvailabilitySection = document.getElementById('dataAvailabilitySection');
        const dataAvailabilityContent = document.getElementById('dataAvailabilityContent');
        const dataAvailabilityLoading = document.getElementById('dataAvailabilityLoading');
        const dataAvailabilityError = document.getElementById('dataAvailabilityError');

        if (!dataAvailabilitySection || !dataAvailabilityContent) {
            console.error('Data availability elements not found');
            return;
        }

        // Show section and loading
        dataAvailabilitySection.style.display = 'block';
        dataAvailabilityLoading.style.display = 'block';
        dataAvailabilityError.style.display = 'none';
        dataAvailabilityContent.innerHTML = '';

        try {
            // Get latest date if not provided
            if (!date) {
                try {
                    const latestDateResponse = await fetch('/api/get-latest-signal-date');
                    if (!latestDateResponse.ok) {
                        console.warn('get-latest-signal-date API not available, using default date');
                        date = '2025-11-28';
                    } else {
                        const latestDateData = await latestDateResponse.json();
                        if (latestDateData.latest_complete_date) {
                            date = latestDateData.latest_complete_date;
                        } else if (latestDateData.dates) {
                            // Use the latest available date
                            const dates = [latestDateData.dates.bhavcopy, latestDateData.dates.indices]
                                .filter(Boolean)
                                .sort()
                                .reverse();
                            date = dates[0] || '2025-11-28';
                        } else {
                            date = '2025-11-28';
                        }
                    }
                } catch (error) {
                    console.warn('Error fetching latest signal date, using default:', error);
                    date = '2025-11-28';
                }
            }

            // Fetch data availability
            const response = await fetch(`/api/check-date-data?date=${date}`);
            const data = await response.json();

            dataAvailabilityLoading.style.display = 'none';

            if (!response.ok || !data.success) {
                throw new Error(data.error || data.message || 'Failed to load data availability');
            }

            // Render data availability
            this.renderDataAvailability(data);
        } catch (error) {
            console.error('Error loading data availability:', error);
            dataAvailabilityLoading.style.display = 'none';
            dataAvailabilityError.style.display = 'block';
            dataAvailabilityError.textContent = error.message || 'Failed to load data availability';
        }
    }

    renderDataAvailability(data) {
        const dataAvailabilityContent = document.getElementById('dataAvailabilityContent');
        if (!dataAvailabilityContent) return;

        const { data: dataInfo, date, canGenerateSignals } = data;

        dataAvailabilityContent.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 20px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div>
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 5px;">Date</div>
                        <div style="font-size: 1.1rem; font-weight: 600; color: #333;">${date}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 5px;">Can Generate Signals</div>
                        <div style="font-size: 1.1rem; font-weight: 600; color: ${canGenerateSignals ? '#10b981' : '#ef4444'};">
                            ${canGenerateSignals ? '✅ Yes' : '❌ No'}
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 15px;">
                    <div style="padding: 12px; background: ${dataInfo.bhavcopy.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${dataInfo.bhavcopy.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Bhavcopy</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${dataInfo.bhavcopy.count} stocks
                        </div>
                    </div>

                    <div style="padding: 12px; background: ${dataInfo.indices.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${dataInfo.indices.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Indices</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${dataInfo.indices.count} indices
                        </div>
                    </div>

                    <div style="padding: 12px; background: ${dataInfo.premarket.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${dataInfo.premarket.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Pre-market</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${dataInfo.premarket.count} items
                        </div>
                    </div>

                    <div style="padding: 12px; background: ${dataInfo.signals.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${dataInfo.signals.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Signals</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${dataInfo.signals.count} signals
                        </div>
                    </div>
                </div>

                ${dataInfo.signalRuns.count > 0 ? `
                    <div style="padding: 12px; background: #f3f4f6; border-radius: 8px; margin-top: 10px;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 8px;">Signal Runs (${dataInfo.signalRuns.count})</div>
                        ${dataInfo.signalRuns.runs.map((run, idx) => `
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: ${idx < dataInfo.signalRuns.runs.length - 1 ? '5px' : '0'};">
                                Run ${idx + 1}: ${run.run_id} • ${run.regime_code || 'N/A'} • ${run.strategies_used?.join(', ') || 'N/A'}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    updateDataSourceDisplay(source, data = null) {
        const dataSource = document.getElementById('dataSource');
        const updateInfo = document.getElementById('updateInfo');

        if (source === 'uploaded' && data) {
            // Show uploaded data info
            if (dataSource) {
                dataSource.textContent = 'Uploaded Data';
            }
            if (updateInfo) {
                const fileName = data.fileName || 'CSV File';
                const date = data.date || 'Unknown date';
                updateInfo.textContent = `${fileName} • ${date}`;
            }
        } else {
            // Show NSE India info
            if (dataSource) {
                dataSource.textContent = 'NSE India';
            }
            if (updateInfo) {
                updateInfo.textContent = 'Updates every 30 sec. during market hrs.';
            }
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
        function initializeApp() {
            try {
                console.log('🚀 Initializing MarketMoodApp...');
            // Only initialize if auth check passes (or if on login page)
            if (window.location.pathname.includes('login.html')) {
                    console.log('On login page, skipping app initialization');
                return; // Login page handles its own logic
            }
            
            if (checkAuth()) {
                    console.log('Auth check passed, creating app instance...');
                window.marketMoodApp = new MarketMoodApp();
                    console.log('✅ MarketMoodApp initialized successfully');
                } else {
                    console.log('Auth check failed, app not initialized');
                }
            } catch (error) {
                console.error('❌ Error initializing MarketMoodApp:', error);
                console.error('Error stack:', error.stack);
            }
        }

        // Try to initialize immediately if DOM is already ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeApp);
        } else {
            // DOM is already ready, initialize immediately
            initializeApp();
        }
        
        // Also try on window load as backup
        window.addEventListener('load', () => {
            if (!window.marketMoodApp) {
                console.log('Window loaded but app not initialized, trying again...');
                initializeApp();
            }
        });