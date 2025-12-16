class MarketMoodApp {
    constructor() {
        this.timerId = null;
        this._signalsStatusData = {
            date: null,
            signalsInfo: null,
            dataAvailability: null,
            strategy: null
        };
        this.lastMarketStatus = null; // Store last known market status
        this.lastSuccessfulStatus = null; // Store last successful market status
        this.consecutiveFailures = 0; // Track consecutive API failures
        this.maxFailures = 3; // Max failures before marking market as closed
        this.viewMode = 'card'; // 'card' or 'table' for all indices view
        this.indexTrends = {}; // Store 14-day trend data for indices
        this.chartsEnabled = this.loadChartsPreference(); // Load preference from localStorage
        this.updateApiUrl();
        this.init();
    }

    loadChartsPreference() {
        const saved = localStorage.getItem('indexChartsEnabled');
        return saved !== null ? saved === 'true' : true; // Default to enabled
    }

    saveChartsPreference(enabled) {
        localStorage.setItem('indexChartsEnabled', enabled.toString());
        this.chartsEnabled = enabled;
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
        
        // Show loading overlay immediately - check if element exists first
        const overlayCheck = document.getElementById('moodLoadingOverlay');
        console.log('🔍 Loading overlay element check:', !!overlayCheck);
        if (overlayCheck) {
            console.log('✅ Overlay found, showing...');
            this.showMoodLoading('Loading market mood...', 'Initializing...');
        } else {
            console.error('❌ Loading overlay not found in DOM!');
            // Try again after a short delay
            setTimeout(() => {
                const retryOverlay = document.getElementById('moodLoadingOverlay');
                if (retryOverlay) {
                    console.log('✅ Overlay found on retry, showing...');
                    this.showMoodLoading('Loading market mood...', 'Initializing...');
                }
            }, 100);
        }
        
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
        // Try to get color from mood-greeting-area if it exists, otherwise use CSS variable
        const moodGreetingArea = document.querySelector('.mood-greeting-area');
        let initialColor = '#667eea';
        let initialGradient = null;
        
        if (moodGreetingArea) {
            const computedStyle = getComputedStyle(moodGreetingArea);
            const bgColor = computedStyle.backgroundColor;
            const bgGradient = computedStyle.backgroundImage || computedStyle.background;
            
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                initialColor = bgColor;
            }
            if (bgGradient && bgGradient !== 'none' && bgGradient !== 'initial') {
                initialGradient = bgGradient;
            }
        } else {
            initialColor = getComputedStyle(document.documentElement).getPropertyValue('--mood-bg-color').trim() || '#667eea';
        }
        
        this.updateThemeColor(initialColor, initialGradient);
        
        // Also create safe area overlay immediately to prevent black inset
        // Create safe area overlay immediately on init
        this.ensureSafeAreaOverlay(initialColor, initialGradient);
        
        // Also ensure it's created even if mood-greeting-area doesn't exist yet
        if (!document.getElementById('safeAreaOverlay')) {
            this.ensureSafeAreaOverlay('#667eea', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
        }
        
        // Set up a periodic check to ensure safe area overlay always matches mood-greeting-area
        // This handles cases where the background changes but updateThemeColor isn't called
        this.safeAreaSyncInterval = setInterval(() => {
            // Only sync if we're on the mood page
            if (this.currentView !== 'mood') {
                return;
            }
            
            const moodGreetingArea = document.querySelector('.mood-greeting-area');
            if (moodGreetingArea) {
                const computedStyle = getComputedStyle(moodGreetingArea);
                const bgGradient = computedStyle.backgroundImage || computedStyle.background;
                const bgColor = computedStyle.backgroundColor;
                
                if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    const safeAreaOverlay = document.getElementById('safeAreaOverlay');
                    if (safeAreaOverlay) {
                        const currentBg = safeAreaOverlay.style.background || safeAreaOverlay.style.backgroundImage || '';
                        const currentColor = safeAreaOverlay.style.backgroundColor || '';
                        
                        // Always update to ensure perfect match (iOS can be finicky)
                        // Convert to string for comparison
                        const bgGradientStr = bgGradient ? String(bgGradient) : '';
                        const currentBgStr = currentBg ? String(currentBg) : '';
                        
                        if (currentBgStr !== bgGradientStr || currentColor !== bgColor) {
                            // Silently sync to avoid console spam
                            this.ensureSafeAreaOverlay(bgColor, bgGradient);
                        }
                    } else {
                        // Recreate if missing (silently)
                        this.ensureSafeAreaOverlay(bgColor, bgGradient);
                    }
                } else {
                    // If mood-greeting-area doesn't have a color yet, ensure overlay exists with default
                    const safeAreaOverlay = document.getElementById('safeAreaOverlay');
                    if (!safeAreaOverlay) {
                        this.ensureSafeAreaOverlay('#667eea', null);
                    }
                }
            }
        }, 2000); // Check every 2 seconds (reduced from 300ms to avoid excessive updates) for more responsive updates
        
        this.updateTimeEl = document.getElementById('updateTime');
        this.greetingTimeEl = document.getElementById('greetingTime');
        this.greetingNameEl = document.getElementById('greetingName');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.moodBtn = document.getElementById('moodBtn');
        this.moodBtnLabel = document.getElementById('moodBtnLabel');
        this.signalsBtn = document.getElementById('signalsBtn');
        this.signalsBtnLabel = document.getElementById('signalsBtnLabel');
        this.generateSignalsBtn = document.getElementById('generateSignalsBtn');
        this.selectStrategyBtn = document.getElementById('selectStrategyBtn');
        this.strategyModal = document.getElementById('strategyModal');
        this.selectedStrategyText = document.getElementById('selectedStrategyText');
        this.refreshDataAvailabilityBtn = document.getElementById('refreshDataAvailabilityBtn');
        this.dataAvailabilitySection = document.getElementById('dataAvailabilitySection');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.selectedStrategy = localStorage.getItem('selectedStrategy') || 'momentum_gap'; // Default strategy
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
        
        // Set default view to mood using centralized function
        this.setActiveView('mood');
        console.log('✓ Initial view set to mood');
        
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
        this.downloadCsvsBtn = document.getElementById('downloadCsvsBtn');
        this.downloadCsvsModal = document.getElementById('downloadCsvsModal');
        this.closeDownloadCsvs = document.getElementById('closeDownloadCsvs');
        this.startDownloadBtn = document.getElementById('startDownloadBtn');
        this.downloadProgressSection = document.getElementById('downloadProgressSection');
        this.fileProgressContainer = document.getElementById('fileProgressContainer');
        
        // Debug: Check if Download CSVs button exists
        if (this.downloadCsvsBtn) {
            console.log('✅ Download CSVs button found in DOM');
            // Ensure button is visible
            this.downloadCsvsBtn.style.display = '';
            this.downloadCsvsBtn.style.visibility = 'visible';
        } else {
            console.error('❌ Download CSVs button NOT found! Checking DOM...');
            const menuOptions = document.querySelector('.menu-options');
            if (menuOptions) {
                console.log('Menu options container found:', menuOptions);
                const allButtons = menuOptions.querySelectorAll('button');
                console.log('All buttons in menu:', Array.from(allButtons).map(b => ({ id: b.id, text: b.textContent.trim() })));
            }
        }

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.handleManualRefresh());
        }
        if (this.moodBtn) {
            this.moodBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.currentView !== 'mood') {
                    console.log('Mood button clicked, switching to Mood view');
                    this.showMoodView();
                }
            });
        }
        if (this.settingsMenuBtn) {
            this.settingsMenuBtn.addEventListener('click', () => {
                console.log('Settings menu button clicked');
                // Close menu modal first
                if (this.menuModal) {
                    this.menuModal.classList.remove('show');
                    this.unlockBodyScroll();
                }
                // Open settings modal after menu closes
                setTimeout(() => {
                    if (window.settingsManager) {
                        console.log('Opening settings modal...');
                        window.settingsManager.openSettingsModal();
                    } else {
                        console.error('settingsManager not found!');
                    }
                }, 100);
            });
        }
        if (this.signalsBtn) {
            this.signalsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.currentView !== 'signals') {
                    console.log('Signals button clicked, switching to Signals view');
                    this.showSignalsView();
                }
            });
        }
        if (this.generateSignalsBtn) {
            this.generateSignalsBtn.addEventListener('click', () => this.generateSignals());
        }
        
        // Setup strategy selector
        this.setupStrategySelector();
        
        // Update selected strategy text on init
        this.updateSelectedStrategyText();
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
        if (this.downloadCsvsBtn) {
            console.log('✅ Download CSVs button found and initialized');
            this.downloadCsvsBtn.addEventListener('click', () => {
                console.log('Download CSVs button clicked');
                this.openDownloadCsvsModal();
            });
        } else {
            console.error('❌ Download CSVs button NOT found in DOM!');
        }
        if (this.startDownloadBtn) {
            this.startDownloadBtn.addEventListener('click', () => this.startDownloadCsvs());
        }

        // Setup menu modal close handlers
        this.setupMenuModal();
        
        // Setup download CSVs modal handlers
        this.setupDownloadCsvsModal();
        
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

        // Setup chart toggle button
        this.chartToggleBtn = document.getElementById('chartToggleBtn');
        if (this.chartToggleBtn) {
            this.updateChartToggleButton();
            this.chartToggleBtn.addEventListener('click', () => this.toggleCharts());
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

        // Update loading status (overlay already shown in init)
        this.updateMoodLoadingStatus('Fetching latest data...');
        
        // First load current mood data (NSE or uploaded CSV)
        this.loadData().then(() => {
            // After initial load, check market status and start/stop polling accordingly
            if (this.lastMarketStatus && this.lastMarketStatus.isOpen) {
                this.startPolling();
            } else {
                this.stopPolling();
            }
            
            // THEN load index history ONLY if charts are enabled
            // This happens after mood page is already displayed
            if (this.chartsEnabled) {
                this.loadIndexHistory().catch(err => {
                    console.warn('Index history loading failed (non-critical):', err);
                });
            } else {
                // Hide loading immediately if charts are disabled
                this.hideMoodLoading();
            }
        }).catch(() => {
            // Hide loading even on error
            this.hideMoodLoading();
        });
    }

    async loadIndexHistory() {
        try {
            // Show loading status for index history
            this.updateMoodLoadingStatus('Loading 14-day trend data...');
            console.log('📊 Loading index history data...');
            
            const response = await fetch('/api/index-history');
            if (response.ok) {
                const data = await response.json();
                this.indexTrends = data || {};
                const indicesCount = Object.keys(this.indexTrends).length;
                console.log(`✅ Loaded index history for ${indicesCount} indices`);
                if (indicesCount > 0) {
                    console.log('📈 Index symbols with history:', Object.keys(this.indexTrends).slice(0, 5).join(', '), indicesCount > 5 ? '...' : '');
                    this.updateMoodLoadingStatus(`Loaded ${indicesCount} index trends`);
                } else {
                    console.warn('⚠️ No index history data available');
                    this.updateMoodLoadingStatus('No trend data available');
                }
                // Re-render index cards if they're already displayed (use setTimeout to not block)
                if (this.lastMarketData && this.lastMarketData.indices) {
                    console.log('🔄 Re-rendering index cards with trend data...');
                    // Delay re-render slightly to avoid blocking UI
                    setTimeout(() => {
                        this.updateIndices(this.lastMarketData.indices || [], this.lastMarketData.vix);
                        // Hide loading after cards are updated
                        setTimeout(() => {
                            this.hideMoodLoading();
                        }, 300);
                    }, 100);
                } else {
                    // Hide loading if no data to update
                    setTimeout(() => {
                        this.hideMoodLoading();
                    }, 300);
                }
            } else {
                const errorText = await response.text().catch(() => '');
                console.warn(`⚠️ Failed to load index history: ${response.status}`, errorText.substring(0, 200));
                this.updateMoodLoadingStatus('Trend data unavailable');
                setTimeout(() => {
                    this.hideMoodLoading();
                }, 500);
            }
        } catch (error) {
            console.error('❌ Error loading index history:', error);
            console.error('Error details:', error.message, error.stack);
            this.updateMoodLoadingStatus('Error loading trends');
            setTimeout(() => {
                this.hideMoodLoading();
            }, 500);
        }
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
        // Don't start polling if we're on Signals page
        if (this.currentView === 'signals') {
            console.log('On Signals page - not starting polling');
            return;
        }
        
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
            // Don't poll if we're on Signals page
            if (this.currentView === 'signals') {
                console.log('On Signals page - skipping polling cycle');
                return;
            }
            
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
        // Keep safe area sync interval running even when polling stops
        // This ensures the overlay always matches the mood-greeting-area
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
        // Update status bar time
        if (this.statusTimeEl) {
            try {
                const opts = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' };
                const formatted = new Intl.DateTimeFormat('en-US', opts).format(date);
                this.statusTimeEl.textContent = formatted;
            } catch (e) {
                this.statusTimeEl.textContent = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }
        }
        
        // Update greeting based on time
        if (this.greetingTimeEl) {
            const hour = new Date(date).getHours();
            let greeting = 'Good Morning!';
            if (hour >= 12 && hour < 17) {
                greeting = 'Good Afternoon!';
            } else if (hour >= 17 && hour < 21) {
                greeting = 'Good Evening!';
            } else if (hour >= 21 || hour < 5) {
                greeting = 'Good Night!';
            }
            this.greetingTimeEl.textContent = greeting;
        }
        
        // Update last updated time (if element exists)
        if (this.updateTimeEl) {
        try {
            const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
            const formatted = new Intl.DateTimeFormat('en-US', opts).format(date);
            this.updateTimeEl.textContent = formatted;
        } catch (e) {
            this.updateTimeEl.textContent = date.toLocaleTimeString();
            }
        }
    }

    showMoodLoading(message = 'Loading market mood...', status = 'Fetching latest data...') {
        console.log('🎨 Showing mood loading overlay...', message, status);
        const overlay = document.getElementById('moodLoadingOverlay');
        const loadingText = document.getElementById('loadingText');
        const loadingStatus = document.getElementById('loadingStatus');
        const moodCard = document.getElementById('moodCard');
        
        if (overlay) {
            // Get current mood-greeting-area background to match loading overlay
            const moodGreetingArea = document.querySelector('.mood-greeting-area');
            if (moodGreetingArea) {
                const computedStyle = getComputedStyle(moodGreetingArea);
                const bgGradient = computedStyle.backgroundImage || computedStyle.background;
                const bgColor = computedStyle.backgroundColor;
                
                if (bgGradient && bgGradient !== 'none' && bgGradient !== 'initial') {
                    overlay.style.setProperty('background', bgGradient, 'important');
                    overlay.style.setProperty('background-image', bgGradient, 'important');
                }
                if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    overlay.style.setProperty('background-color', bgColor, 'important');
                }
            } else {
                // Use default gradient if greeting area not available yet
                const defaultGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                overlay.style.setProperty('background', defaultGradient, 'important');
                overlay.style.setProperty('background-color', '#667eea', 'important');
            }
            
            overlay.classList.remove('hidden');
            overlay.style.setProperty('display', 'flex', 'important');
            overlay.style.setProperty('opacity', '1', 'important');
            overlay.style.setProperty('visibility', 'visible', 'important');
            overlay.style.setProperty('position', 'fixed', 'important');
            overlay.style.setProperty('top', '0', 'important');
            overlay.style.setProperty('left', '0', 'important');
            overlay.style.setProperty('right', '0', 'important');
            overlay.style.setProperty('bottom', '0', 'important');
            overlay.style.setProperty('z-index', '99999', 'important');
            overlay.style.setProperty('padding-top', 'env(safe-area-inset-top, 0px)', 'important');
            
            console.log('✅ Loading overlay shown', overlay.style.display);
            if (loadingText) loadingText.textContent = message;
            if (loadingStatus) loadingStatus.textContent = status;
            
            // Update safe area overlay to match loading overlay
            this.updateLoadingSafeArea(overlay);
        } else {
            console.error('❌ Loading overlay element not found!');
        }
        if (moodCard) {
            moodCard.style.opacity = '0';
        }
    }
    
    updateLoadingSafeArea(overlay) {
        // Update safe area overlay to match loading overlay background
        const computedStyle = getComputedStyle(overlay);
        const bgGradient = computedStyle.backgroundImage || computedStyle.background;
        const bgColor = computedStyle.backgroundColor;
        
        let safeAreaOverlay = document.getElementById('safeAreaOverlay');
        if (!safeAreaOverlay) {
            safeAreaOverlay = document.createElement('div');
            safeAreaOverlay.id = 'safeAreaOverlay';
            document.body.appendChild(safeAreaOverlay);
        }
        
        const finalGradient = bgGradient && bgGradient !== 'none' && bgGradient !== 'initial' 
            ? bgGradient 
            : `linear-gradient(135deg, ${bgColor} 0%, ${bgColor} 100%)`;
        
        // Add 1px extra height to prevent any gap
        const safeAreaHeight = `calc(env(safe-area-inset-top, 0px) + 1px)`;
        safeAreaOverlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: ${safeAreaHeight} !important;
            min-height: ${safeAreaHeight} !important;
            background-color: ${bgColor} !important;
            background-image: ${finalGradient} !important;
            background: ${finalGradient} !important;
            background-attachment: fixed !important;
            background-size: cover !important;
            background-repeat: no-repeat !important;
            z-index: 100000 !important;
            pointer-events: none !important;
            margin: 0 !important;
            padding: 0 !important;
        `;
    }

    hideMoodLoading() {
        console.log('🎨 Hiding mood loading overlay...');
        const overlay = document.getElementById('moodLoadingOverlay');
        const moodCard = document.getElementById('moodCard');
        
        if (overlay) {
            overlay.classList.add('hidden');
            // Also set display to none for safety
            setTimeout(() => {
                if (overlay.classList.contains('hidden')) {
                    overlay.style.display = 'none';
                }
            }, 500); // After fade out animation
        }
        if (moodCard) {
            moodCard.style.opacity = '1';
        }
    }

    updateMoodLoadingStatus(status) {
        const loadingStatus = document.getElementById('loadingStatus');
        if (loadingStatus) {
            loadingStatus.textContent = status;
        }
    }

    updateUI(data) {
        // Only update Mood page elements if we're on the Mood page
        if (this.currentView !== 'mood') {
            console.log('Not on Mood page, skipping UI updates');
            return;
        }
        
        // Store current market data for re-rendering when index history loads
        this.lastMarketData = data;

        // Update loading status - mood data loaded, now loading index history
        this.updateMoodLoadingStatus('Mood data loaded. Loading trend charts...');

        // Update mood
        const moodEmoji = document.getElementById('moodEmoji');
        const moodText = document.getElementById('moodText');
        const scoreFill = document.getElementById('scoreFill');
        const scoreText = document.getElementById('scoreText');

        if (data.mood) {
            if (moodEmoji) moodEmoji.textContent = data.mood.emoji || '😐';
            if (moodText) moodText.textContent = data.mood.text || '';
            
            // Note: Signals page is standalone - no mood syncing needed
            if (scoreFill && typeof data.mood.score === 'number') {
                const pct = Math.max(0, Math.min(100, data.mood.score));
                scoreFill.style.width = pct + '%';
            }
            if (scoreText) scoreText.textContent = (data.mood.score != null) ? `${data.mood.score}/100` : '-/-';
            
            // Update market explanation
            this.updateMarketExplanation(data);
            
            // Update background color based on mood score
            console.log('🎨 Calling updateBackgroundColor with score:', data.mood.score);
            this.updateBackgroundColor(data.mood.score);
            
            // Immediately update safe area overlay to match mood color
            // This ensures the inset area updates right away
            setTimeout(() => {
                const moodGreetingArea = document.querySelector('.mood-greeting-area');
                if (moodGreetingArea) {
                    const computedStyle = getComputedStyle(moodGreetingArea);
                    const bgGradient = computedStyle.backgroundImage || computedStyle.background;
                    const bgColor = computedStyle.backgroundColor;
                    
                    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                        this.updateThemeColor(bgColor, bgGradient);
                    }
                }
            }, 100);
        }

        // Update indices display (only on Mood page)
        this.updateIndices(data.indices || [], data.vix);

        // Advance/Decline (only on Mood page)
        if (this.currentView === 'mood') {
        const adv = document.getElementById('advances');
        const dec = document.getElementById('declines');
        if (adv) adv.textContent = (data.advanceDecline && data.advanceDecline.advances != null) ? data.advanceDecline.advances : '-';
        if (dec) dec.textContent = (data.advanceDecline && data.advanceDecline.declines != null) ? data.advanceDecline.declines : '-';
        }
    }

    syncMoodToSignalsPage(mood) {
        // Mood elements removed from Signals page - this function is now a no-op
        // Signals page is standalone and doesn't display mood information
        return;
    }

    updateIndices(indices, vix) {
        // Only update indices if we're on the Mood page
        if (this.currentView !== 'mood') {
            return; // Don't render indices on Signals page
        }
        
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

    // Trend calculation utilities
    getTrendColor(values) {
        if (!values || values.length < 2) return '#9CA3AF';
        const first = values[0];
        const last = values[values.length - 1];
        if (last > first) return '#22C55E';
        if (last < first) return '#EF4444';
        return '#9CA3AF';
    }

    getTrendPercent(values) {
        if (!values || values.length < 2) return '0.00';
        const first = values[0];
        const last = values[values.length - 1];
        if (first === 0) return '0.00';
        return ((last - first) / first * 100).toFixed(2);
    }

    // Create sparkline chart
    createSparkline(container, data, color) {
        if (!data || data.length < 2) {
            container.style.height = '40px';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.textContent = '-';
            return null;
        }

        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            // Chart.js not loaded yet - try again after a delay
            setTimeout(() => {
                if (typeof Chart !== 'undefined') {
                    this.createSparkline(container, data, color);
                } else {
                    container.style.height = '40px';
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                    container.style.justifyContent = 'center';
                    container.textContent = '-';
                }
            }, 500);
            return null;
        }

        // Clear container
        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.height = '40px';
        container.style.width = '100%';
        container.style.minWidth = '150px';

        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        // Use double requestAnimationFrame to ensure container is fully rendered
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    const ctx = canvas.getContext('2d');
                    
                    // Get container width, use parent width or default
                    const parentWidth = container.parentElement?.offsetWidth || container.offsetWidth || 200;
                    const containerWidth = Math.max(parentWidth - 40, 150); // Account for padding
                    
                    // Set canvas size
                    canvas.width = containerWidth;
                    canvas.height = 40;

                    // Create Chart.js chart
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: data.map((_, i) => i),
                            datasets: [{
                                data: data,
                                borderColor: color,
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                tension: 0.3,
                                pointRadius: 0,
                                pointHoverRadius: 0,
                                fill: false
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            animation: {
                                duration: 0 // Disable animation for faster rendering
                            },
                            plugins: {
                                legend: {
                                    display: false
                                },
                                tooltip: {
                                    enabled: false
                                }
                            },
                            scales: {
                                x: {
                                    display: false
                                },
                                y: {
                                    display: false
                                }
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error creating sparkline chart:', error);
                    container.textContent = '-';
                }
            });
        });

        return null; // Return null since chart is created asynchronously
    }

    createIndexCard(index) {
        const card = document.createElement('div');
        card.className = 'data-card';
        
        // Create flex container for content
        const contentContainer = document.createElement('div');
        contentContainer.style.display = 'flex';
        contentContainer.style.flexDirection = 'column';
        contentContainer.style.gap = '8px';
        contentContainer.style.width = '100%';
        
        const title = document.createElement('h3');
        title.textContent = index.symbol;
        title.style.margin = '0';
        title.style.fontSize = '0.9rem';
        title.style.fontWeight = '600';
        contentContainer.appendChild(title);
        
        const value = document.createElement('div');
        value.className = 'data-value';
        if (index.lastPrice != null) {
            value.textContent = typeof index.lastPrice === 'number' ? index.lastPrice.toFixed(2) : index.lastPrice;
        } else {
            value.textContent = '-';
        }
        value.style.margin = '0';
        value.style.fontSize = '1.1rem';
        value.style.fontWeight = 'bold';
        contentContainer.appendChild(value);
        
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
        change.style.margin = '0';
        change.style.fontSize = '0.85rem';
        contentContainer.appendChild(change);

        // Add 14-day trend section (only if charts are enabled and data is available)
        if (this.chartsEnabled) {
            const trendData = this.indexTrends && this.indexTrends[index.symbol];
            if (trendData && Array.isArray(trendData) && trendData.length >= 2) {
                const trendValues = trendData.map(d => d.close);
                const trendColor = this.getTrendColor(trendValues);
                const trendPercent = this.getTrendPercent(trendValues);
                const isPositive = parseFloat(trendPercent) > 0;
                const isNegative = parseFloat(trendPercent) < 0;
                const arrow = isPositive ? '↑' : (isNegative ? '↓' : '→');
                const sign = isPositive ? '+' : '';

                const trendContainer = document.createElement('div');
                trendContainer.style.display = 'flex';
                trendContainer.style.flexDirection = 'column';
                trendContainer.style.gap = '4px';
                trendContainer.style.marginTop = '8px';
                trendContainer.style.paddingTop = '8px';
                trendContainer.style.borderTop = '1px solid #e5e7eb';

                const trendLabel = document.createElement('div');
                trendLabel.style.fontSize = '0.75rem';
                trendLabel.style.color = '#6b7280';
                trendLabel.textContent = `${arrow} ${sign}${trendPercent}% (14-day)`;
                trendLabel.style.color = trendColor;
                trendLabel.style.fontWeight = '500';
                trendContainer.appendChild(trendLabel);

                const sparklineContainer = document.createElement('div');
                sparklineContainer.style.height = '40px';
                sparklineContainer.style.width = '100%';
                trendContainer.appendChild(sparklineContainer);

                // Create sparkline chart
                this.createSparkline(sparklineContainer, trendValues, trendColor);

                contentContainer.appendChild(trendContainer);
            }
        }
        
        card.appendChild(contentContainer);
        
        return card;
    }

    toggleCharts() {
        this.chartsEnabled = !this.chartsEnabled;
        this.saveChartsPreference(this.chartsEnabled);
        this.updateChartToggleButton();
        
        if (this.chartsEnabled) {
            // Load index history if enabled
            console.log('📊 Charts enabled, loading index history...');
            this.loadIndexHistory().catch(err => {
                console.warn('Index history loading failed:', err);
            });
        } else {
            // Clear index trends and re-render cards without charts
            console.log('📊 Charts disabled, clearing trend data...');
            this.indexTrends = {};
        }
        
        // Re-render all index cards
        if (this.lastMarketData && this.lastMarketData.indices) {
            this.updateIndices(this.lastMarketData.indices || [], this.lastMarketData.vix);
        }
    }

    updateChartToggleButton() {
        if (this.chartToggleBtn) {
            if (this.chartsEnabled) {
                this.chartToggleBtn.classList.add('active');
                this.chartToggleBtn.title = 'Disable 14-day trend charts';
            } else {
                this.chartToggleBtn.classList.remove('active');
                this.chartToggleBtn.title = 'Enable 14-day trend charts';
            }
        }
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

    generateMarketExplanation(data) {
        // Generate a simple explanation based on market data
        if (!data) return '';
        
        const score = data.mood?.score;
        const indices = data.indices || [];
        const vix = data.vix;
        const advanceDecline = data.advanceDecline;
        
        // Get key indices
        const nifty50 = indices.find(idx => 
            idx.symbol?.toUpperCase().includes('NIFTY 50') || 
            idx.symbol?.toUpperCase() === 'NIFTY50'
        );
        const niftyBank = indices.find(idx => 
            idx.symbol?.toUpperCase().includes('NIFTY BANK') || 
            idx.symbol?.toUpperCase() === 'NIFTYBANK'
        );
        
        // Count positive and negative indices
        const positiveIndices = indices.filter(idx => idx.pChange > 0).length;
        const negativeIndices = indices.filter(idx => idx.pChange < 0).length;
        const totalIndices = indices.length;
        
        // Build explanation based on data
        let explanation = '';
        
        if (score >= 70) {
            explanation = 'Market is showing strong bullish momentum with most indices in positive territory.';
        } else if (score >= 60) {
            explanation = 'Market sentiment is bullish with majority of indices trading higher.';
        } else if (score >= 50) {
            if (nifty50 && nifty50.pChange > 0) {
                explanation = 'Market is slightly positive with key indices showing modest gains.';
            } else {
                explanation = 'Market is mixed with some indices in positive territory.';
            }
        } else if (score >= 40) {
            if (vix && vix.pChange > 10) {
                explanation = 'Market volatility is elevated, indicating uncertainty among investors.';
            } else {
                explanation = 'Market sentiment is neutral with mixed signals from different sectors.';
            }
        } else if (score >= 30) {
            if (advanceDecline && advanceDecline.declines > advanceDecline.advances) {
                explanation = 'Market is showing bearish pressure with more declining stocks than advancing ones.';
            } else {
                explanation = 'Market sentiment is slightly bearish with most indices in negative territory.';
            }
        } else if (score >= 20) {
            if (niftyBank && niftyBank.pChange < -1) {
                explanation = 'Banking sector weakness is dragging the market lower.';
            } else {
                explanation = 'Market is bearish with widespread selling pressure across indices.';
            }
        } else {
            if (vix && vix.pChange > 15) {
                explanation = 'High volatility and fear are dominating the market with significant selling pressure.';
            } else {
                explanation = 'Market is showing strong bearish sentiment with most indices declining.';
            }
        }
        
        // Add specific details if available
        if (nifty50 && Math.abs(nifty50.pChange) > 0.5) {
            const direction = nifty50.pChange > 0 ? 'up' : 'down';
            explanation += ` NIFTY 50 is ${direction} ${Math.abs(nifty50.pChange).toFixed(2)}%.`;
        }
        
        return explanation;
    }

    updateMarketExplanation(data) {
        const explanationEl = document.getElementById('moodExplanation');
        if (!explanationEl) return;
        
        const explanation = this.generateMarketExplanation(data);
        if (explanation) {
            explanationEl.textContent = explanation;
            explanationEl.style.display = 'block';
        } else {
            explanationEl.style.display = 'none';
        }
    }

    updateBackgroundColor(score) {
        // Update greeting area background based on mood score
        const moodGreetingArea = document.querySelector('.mood-greeting-area');
        console.log('🎨 updateBackgroundColor called with score:', score);

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

        // Update greeting area background
        if (moodGreetingArea) {
            moodGreetingArea.style.setProperty('background', gradient, 'important');
            moodGreetingArea.style.setProperty('background-color', themeColor, 'important');
        }
        
        console.log('✅ Updated greeting area with gradient:', gradient, 'themeColor:', themeColor);
        
        // Update loading overlay if it's visible to match new background
        const loadingOverlay = document.getElementById('moodLoadingOverlay');
        if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
            loadingOverlay.style.setProperty('background', gradient, 'important');
            loadingOverlay.style.setProperty('background-color', themeColor, 'important');
            this.updateLoadingSafeArea(loadingOverlay);
        }
        
        // Update PWA theme-color meta tag for mobile browser inset
        // Pass both color and gradient to ensure safe area matches greeting area
        this.updateThemeColor(themeColor, gradient);
        
        // Re-render calendar if it's open to update today's color to match current mood
        if (this.calendarModal && this.calendarModal.classList.contains('show')) {
            setTimeout(() => {
                this.renderCalendar();
            }, 150);
        }
        
        // Force update safe area overlay again after DOM update to ensure perfect match
        // Use requestAnimationFrame to ensure greeting area styles are applied
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const updatedGreetingArea = document.querySelector('.mood-greeting-area');
                if (updatedGreetingArea) {
                    const computedStyle = getComputedStyle(updatedGreetingArea);
                    const bgGradient = computedStyle.backgroundImage || computedStyle.background;
                    const bgColor = computedStyle.backgroundColor;
                    
                    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                        // Force update to ensure perfect match
                        this.updateThemeColor(bgColor, bgGradient);
                    }
                }
            });
        });
    }

    ensureSafeAreaOverlay(color, gradient = null) {
        // Ensure safe area overlay exists and has correct color immediately
        // This is CRITICAL for iOS PWA to show mood color in the notch/Dynamic Island area
        let safeAreaOverlay = document.getElementById('safeAreaOverlay');
        if (!safeAreaOverlay) {
            safeAreaOverlay = document.createElement('div');
            safeAreaOverlay.id = 'safeAreaOverlay';
            // Insert at the very beginning of body to ensure it's on top
            if (document.body.firstChild) {
                document.body.insertBefore(safeAreaOverlay, document.body.firstChild);
            } else {
                document.body.appendChild(safeAreaOverlay);
            }
            console.log('✅ Created safeAreaOverlay element');
        }
        
        // ALWAYS read from mood-greeting-area as the source of truth
        const moodGreetingArea = document.querySelector('.mood-greeting-area');
        let finalColor = color || '#667eea';
        let finalGrad = gradient || `linear-gradient(135deg, ${finalColor} 0%, ${finalColor} 100%)`;
        
        if (moodGreetingArea) {
            const computedStyle = getComputedStyle(moodGreetingArea);
            const bgGradient = computedStyle.backgroundImage || computedStyle.background;
            const bgColor = computedStyle.backgroundColor;
            
            // Use the actual computed background from greeting area - this is the source of truth
            if (bgGradient && bgGradient !== 'none' && bgGradient !== 'initial' && bgGradient !== 'rgba(0, 0, 0, 0)' && !bgGradient.includes('url(')) {
                finalGrad = bgGradient;
            }
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' && bgColor !== 'rgb(0, 0, 0)' && bgColor !== '#000000') {
                finalColor = bgColor;
                // If we have a color but no gradient, create a simple gradient
                if (!finalGrad || finalGrad === 'none' || finalGrad === 'initial') {
                    finalGrad = `linear-gradient(135deg, ${finalColor} 0%, ${finalColor} 100%)`;
                }
            }
        }
        
        // Fallback: ensure we never use black
        if (!finalColor || finalColor === 'rgba(0, 0, 0, 0)' || finalColor === 'transparent' || finalColor === 'rgb(0, 0, 0)' || finalColor === '#000000') {
            finalColor = '#667eea';
            finalGrad = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
        
        const safeAreaHeight = `calc(env(safe-area-inset-top, 0px) + 1px)`;
        
        // Apply styles with maximum specificity to override any other styles
        // Use setProperty for each style to ensure they're applied
        safeAreaOverlay.style.setProperty('position', 'fixed', 'important');
        safeAreaOverlay.style.setProperty('top', '0', 'important');
        safeAreaOverlay.style.setProperty('left', '0', 'important');
        safeAreaOverlay.style.setProperty('right', '0', 'important');
        safeAreaOverlay.style.setProperty('width', '100%', 'important');
        safeAreaOverlay.style.setProperty('height', safeAreaHeight, 'important');
        safeAreaOverlay.style.setProperty('min-height', safeAreaHeight, 'important');
        safeAreaOverlay.style.setProperty('max-height', safeAreaHeight, 'important');
        safeAreaOverlay.style.setProperty('background-color', finalColor, 'important');
        safeAreaOverlay.style.setProperty('background-image', finalGrad, 'important');
        safeAreaOverlay.style.setProperty('background', finalGrad, 'important');
        safeAreaOverlay.style.setProperty('background-attachment', 'fixed', 'important');
        safeAreaOverlay.style.setProperty('background-size', 'cover', 'important');
        safeAreaOverlay.style.setProperty('background-position', 'center top', 'important');
        safeAreaOverlay.style.setProperty('background-repeat', 'no-repeat', 'important');
        safeAreaOverlay.style.setProperty('z-index', '999999', 'important'); // Even higher z-index
        safeAreaOverlay.style.setProperty('pointer-events', 'none', 'important');
        safeAreaOverlay.style.setProperty('margin', '0', 'important');
        safeAreaOverlay.style.setProperty('padding', '0', 'important');
        safeAreaOverlay.style.setProperty('border', 'none', 'important');
        safeAreaOverlay.style.setProperty('display', 'block', 'important');
        safeAreaOverlay.style.setProperty('visibility', 'visible', 'important');
        safeAreaOverlay.style.setProperty('opacity', '1', 'important');
        safeAreaOverlay.style.setProperty('transform', 'none', 'important');
        
        // Force a repaint
        void safeAreaOverlay.offsetHeight;
        
        console.log('✅ Updated safeAreaOverlay to match mood-greeting-area:', finalColor, finalGrad);
    }

    updateThemeColor(color, gradient = null) {
        // Update or create theme-color meta tag for PWA inset
        // This is CRITICAL for iOS PWA Dynamic Island/notch area
        let themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeColorMeta) {
            themeColorMeta = document.createElement('meta');
            themeColorMeta.setAttribute('name', 'theme-color');
            document.head.appendChild(themeColorMeta);
        }
        // Always remove and re-add to force update in PWA mode (iOS requires this)
            themeColorMeta.remove();
            themeColorMeta = document.createElement('meta');
            themeColorMeta.setAttribute('name', 'theme-color');
            themeColorMeta.setAttribute('content', color);
            document.head.insertBefore(themeColorMeta, document.head.firstChild);
        
        // Also update iOS Safari status bar style - black-translucent allows background to show
        let appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (!appleStatusBar) {
            appleStatusBar = document.createElement('meta');
            appleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
            document.head.appendChild(appleStatusBar);
        }
        // Use black-translucent for iOS PWA to show the theme color through
        appleStatusBar.setAttribute('content', 'black-translucent');
        
        // Keep html and body background white (mood color is only on greeting area now)
        const html = document.documentElement;
        const body = document.body;
        html.style.setProperty('background-color', '#ffffff', 'important');
        body.style.setProperty('background-color', '#ffffff', 'important');
        
        // CRITICAL: Always read from mood-greeting-area to ensure safe area matches exactly
        // This ensures the inset area matches the greeting area background on iOS
        const moodGreetingArea = document.querySelector('.mood-greeting-area');
        let finalGradient = gradient || `linear-gradient(135deg, ${color} 0%, ${color} 100%)`;
        let bgColor = color;
        
        if (moodGreetingArea) {
            const computedStyle = getComputedStyle(moodGreetingArea);
            const bgGradient = computedStyle.backgroundImage || computedStyle.background;
            const bgColorStyle = computedStyle.backgroundColor;
            
            // Use the actual computed background from greeting area - this is the source of truth
            if (bgGradient && bgGradient !== 'none' && bgGradient !== 'initial' && bgGradient !== 'rgba(0, 0, 0, 0)') {
                finalGradient = bgGradient;
            }
            if (bgColorStyle && bgColorStyle !== 'rgba(0, 0, 0, 0)' && bgColorStyle !== 'transparent') {
                bgColor = bgColorStyle;
            }
        }
        
        // Update safe area overlay to match mood-greeting-area exactly
        this.ensureSafeAreaOverlay(bgColor, finalGradient);
        
        // Force a repaint to ensure updates are visible on iOS
        void body.offsetHeight;
        
        console.log('✅ Updated safe area overlay to match mood-greeting-area:', bgColor, finalGradient);
    }

    setLoading(isLoading) {
        if (this.refreshBtn) {
            this.refreshBtn.disabled = isLoading;
        }
    }

    setupStrategySelector() {
        const selectStrategyBtn = this.selectStrategyBtn;
        const strategyModal = this.strategyModal;
        const closeStrategyModal = document.getElementById('closeStrategyModal');
        const cancelStrategyBtn = document.getElementById('cancelStrategyBtn');
        const applyStrategyBtn = document.getElementById('applyStrategyBtn');
        const strategyList = document.getElementById('strategyList');
        
        // Define available strategies
        const strategies = [
            {
                id: 'momentum_gap',
                name: 'Momentum Gap',
                description: 'Find stocks with positive gaps and strong momentum. Best for bullish markets with low volatility.',
                icon: '📈'
            },
            {
                id: 'breakout',
                name: 'Breakout',
                description: 'Look for stocks breaking out of consolidation patterns with high volume. Best for volatile bullish markets.',
                icon: '🚀'
            },
            {
                id: 'mean_reversion',
                name: 'Mean Reversion',
                description: 'Find oversold stocks that may revert to mean. Best for neutral markets with low volatility.',
                icon: '🔄'
            },
            {
                id: 'defensive',
                name: 'Defensive / Wait',
                description: 'Conservative approach for bearish markets. Wait for better entry points or consider defensive positions.',
                icon: '🛡️'
            },
            {
                id: 'volatility_play',
                name: 'Volatility Play',
                description: 'Focus on high-beta stocks with strong momentum. Best for high volatility environments.',
                icon: '⚡'
            }
        ];
        
        // Render strategy list
        if (strategyList) {
            strategyList.innerHTML = strategies.map(strategy => `
                <div class="strategy-option" data-strategy="${strategy.id}" style="
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    cursor: pointer;
                    transition: all 0.2s;
                    background: #ffffff;
                ">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <span style="font-size: 1.5rem;">${strategy.icon}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 1rem; color: #333; margin-bottom: 4px;">${strategy.name}</div>
                            <div style="font-size: 0.85rem; color: #666; line-height: 1.4;">${strategy.description}</div>
                        </div>
                        <div class="strategy-check" style="
                            width: 24px;
                            height: 24px;
                            border: 2px solid #667eea;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            opacity: 0;
                            transition: opacity 0.2s;
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>
            `).join('');
            
            // Add click handlers
            const strategyOptions = strategyList.querySelectorAll('.strategy-option');
            let selectedStrategyId = this.selectedStrategy;
            
            strategyOptions.forEach(option => {
                const strategyId = option.dataset.strategy;
                
                // Mark current selection
                if (strategyId === this.selectedStrategy) {
                    option.style.borderColor = '#667eea';
                    option.style.background = '#f0f4ff';
                    option.querySelector('.strategy-check').style.opacity = '1';
                }
                
                option.addEventListener('click', () => {
                    // Remove previous selection
                    strategyOptions.forEach(opt => {
                        opt.style.borderColor = '#e5e7eb';
                        opt.style.background = '#ffffff';
                        opt.querySelector('.strategy-check').style.opacity = '0';
                    });
                    
                    // Mark new selection
                    option.style.borderColor = '#667eea';
                    option.style.background = '#f0f4ff';
                    option.querySelector('.strategy-check').style.opacity = '1';
                    selectedStrategyId = strategyId;
                });
            });
            
            // Apply button
            if (applyStrategyBtn) {
                applyStrategyBtn.addEventListener('click', () => {
                    this.selectedStrategy = selectedStrategyId;
                    localStorage.setItem('selectedStrategy', selectedStrategyId);
                    this.updateSelectedStrategyText();
                    if (strategyModal) {
                        strategyModal.classList.remove('show');
                    }
                    // Regenerate signals with new strategy
                    if (this.currentView === 'signals') {
                        this.loadSignals();
                    }
                });
            }
        }
        
        // Open modal
        if (selectStrategyBtn && strategyModal) {
            selectStrategyBtn.addEventListener('click', () => {
                strategyModal.classList.add('show');
            });
        }
        
        // Close modal
        if (closeStrategyModal && strategyModal) {
            closeStrategyModal.addEventListener('click', () => {
                strategyModal.classList.remove('show');
            });
        }
        
        if (cancelStrategyBtn && strategyModal) {
            cancelStrategyBtn.addEventListener('click', () => {
                strategyModal.classList.remove('show');
            });
        }
        
        // Close on backdrop click
        if (strategyModal) {
            strategyModal.addEventListener('click', (e) => {
                if (e.target === strategyModal) {
                    strategyModal.classList.remove('show');
                }
            });
        }
    }
    
    updateSelectedStrategyText() {
        const strategyNames = {
            'momentum_gap': 'Momentum Gap',
            'breakout': 'Breakout',
            'mean_reversion': 'Mean Reversion',
            'defensive': 'Defensive / Wait',
            'volatility_play': 'Volatility Play'
        };
        
        if (this.selectedStrategyText) {
            this.selectedStrategyText.textContent = strategyNames[this.selectedStrategy] || 'Select Strategy';
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
                    
                    // Validate file type - CSV only for bhavcopy
                    const fileExtension = file.name.split('.').pop().toLowerCase();
                    const uploadType = document.getElementById('uploadType')?.value;
                    
                    if (fileExtension === 'dat') {
                        // Reject .dat files with clear error message
                        this.showUploadStatus('DAT bhavcopy files are no longer supported. Please upload the NSE CSV bhavcopy file (e.g., sec_bhavdata_full_YYYYMMDD.csv).', 'error');
                        if (uploadDataBtn) uploadDataBtn.disabled = true;
                        fileName.textContent = 'Choose CSV file...';
                        csvFile.value = ''; // Clear the file input
                        return;
                    }
                    
                    if (fileExtension !== 'csv') {
                        this.showUploadStatus('Please select a CSV file', 'error');
                        if (uploadDataBtn) uploadDataBtn.disabled = true;
                    }
                } else {
                    fileName.textContent = 'Choose CSV file...';
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
        
        // Date input change handler
        if (dataDate) {
            dataDate.addEventListener('change', () => {
                this.updateUploadButtonState();
            });
            dataDate.addEventListener('input', () => {
                this.updateUploadButtonState();
            });
        }
        
        // Initialize button state on page load
        this.updateUploadButtonState();

        // Upload button
        if (uploadDataBtn && csvFile && dataDate) {
            uploadDataBtn.addEventListener('click', () => {
                const file = csvFile.files[0];
                const date = dataDate.value;
                const uploadType = document.getElementById('uploadType')?.value;
                
                // Validate all required fields
                if (!file) {
                    this.showUploadStatus('Please select a file to upload', 'error');
                    return;
                }
                
                if (!date || date.trim() === '') {
                    this.showUploadStatus('Please select a date', 'error');
                    return;
                }
                
                if (!uploadType || uploadType.trim() === '') {
                    this.showUploadStatus('Please select a data type', 'error');
                    return;
                }
                
                // Validate file type - CSV only, reject .dat files
                const fileExtension = file.name.split('.').pop().toLowerCase();
                if (fileExtension === 'dat') {
                    this.showUploadStatus('DAT bhavcopy files are no longer supported. Please upload the NSE CSV bhavcopy file (e.g., sec_bhavdata_full_YYYYMMDD.csv).', 'error');
                    return;
                }
                if (fileExtension !== 'csv') {
                    this.showUploadStatus('Please select a CSV file', 'error');
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        // CSV files only - .dat support removed
                        const fileExtension = file.name.split('.').pop().toLowerCase();
                        let parsedData;
                        
                        // For premarket files, use the robust NSE pre-open CSV parser
                        if (uploadType === 'premarket') {
                                const { header, parsedRows } = this.parseNSEPremarketCSV(e.target.result, file.name);
                                const parsedCount = Array.isArray(parsedRows) ? parsedRows.length : 0;
                                console.log(`📊 Processing ${parsedCount} rows from NSE premarket CSV`);
                                
                                // Use parsedRows array for processing (for future analytics)
                                parsedData = parsedRows;
                                
                                // Store parsed count for summary (regardless of price validation)
                                // This will be used as the "count" field
                                this._premarketParsedCount = parsedCount;
                                this._premarketHeader = header;
                            } else {
                                // Default to standard CSV parsing for other types (including bhavcopy)
                                parsedData = this.parseCSV(e.target.result);
                            }
                        
                        // Process data based on upload type
                        let processedData;
                        if (uploadType === 'bhav') {
                            processedData = this.processBhavcopyData(parsedData, date, file.name);
                            // Explicitly set indicesCount for bhavcopy
                            const bhavCount = processedData.indices?.length || 0;
                            processedData.indicesCount = bhavCount;
                            processedData.count = bhavCount;
                            
                            // CRITICAL: Ensure indices array exists and is populated
                            if (!Array.isArray(processedData.indices)) {
                                console.error(`❌ Bhavcopy processing failed: indices is not an array`, processedData);
                                this.showUploadStatus('Bhavcopy processing error - indices not an array', 'error');
                                return;
                            }
                            
                            if (!bhavCount || bhavCount === 0) {
                                console.warn(`⚠️ Bhavcopy has 0 processed EQ stocks, skipping DB save for ${date}`, file.name);
                                console.warn(`   Parsed rows: ${parsedData.length}, Processed EQ stocks: ${bhavCount}`);
                                this.showUploadStatus('Bhavcopy processed 0 EQ stocks - check file format', 'warning');
                                return;
                            }
                            
                            console.log(`📊 Saving bhavcopy for date ${date} with count=${bhavCount} stocks`);
                            console.log(`   ✅ Indices array is valid: ${Array.isArray(processedData.indices)}, length: ${processedData.indices.length}`);
                        } else if (uploadType === 'premarket') {
                            processedData = this.processPremarketData(parsedData, date, file.name);
                            
                            // Use parsed row count (not processed stocks count) for summary
                            const premarketCount = this._premarketParsedCount || 0;
                            processedData.indicesCount = premarketCount;
                            processedData.count = premarketCount;
                            processedData.dateDataPremarketCount = premarketCount;
                            processedData.header = this._premarketHeader || [];
                            
                            console.log(`📊 Saving premarket for date ${date} with premarketCount=${premarketCount} (parsedRows=${premarketCount})`);
                            
                            // Clear temporary storage
                            this._premarketParsedCount = null;
                            this._premarketHeader = null;
                        } else if (uploadType === 'marketactivity') {
                            // Process Market Activity (EOD) data
                            processedData = this.processCSVData(parsedData, date, file.name);
                            processedData.type = 'marketactivity';
                            const maCount = processedData.indices?.length || 0;
                            processedData.indicesCount = maCount;
                            processedData.count = maCount;
                            console.log(`📊 Saving Market Activity for date ${date} with count=${maCount}`);
                        } else if (uploadType === '52w') {
                            // Process 52W High/Low data
                            processedData = this.processCSVData(parsedData, date, file.name);
                            processedData.type = '52w';
                            const week52Count = processedData.indices?.length || 0;
                            processedData.indicesCount = week52Count;
                            processedData.count = week52Count;
                            console.log(`📊 Saving 52W High/Low for date ${date} with count=${week52Count}`);
                        } else {
                            // Default to indices processing
                            processedData = this.processCSVData(parsedData, date, file.name);
                        }
                        
                        // Add type to processed data
                        processedData.type = uploadType;
                        
                        // Store in localStorage with type-specific key
                        const storageKey = `uploaded${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)}Data`;
                        localStorage.setItem(storageKey, JSON.stringify(processedData));
                        
                        // Also save to database (optional - will work even if DB is not configured)
                        // Wait for save to complete before refreshing the table
                        try {
                            await this.saveToDatabase(processedData, file.name, date, uploadType);
                            console.log('✅ Data saved to database successfully');
                        } catch (err) {
                            console.warn('Failed to save to database (continuing with localStorage):', err);
                        }
                        
                        this.showUploadStatus('Data uploaded successfully!', 'success');
                        
                        // Refresh the uploaded data table after a short delay to ensure DB is updated
                        // Use a longer delay to ensure database has processed the insert
                        setTimeout(() => {
                        this.updateUploadedDataInfo();
                            console.log('✅ Uploaded data table refreshed');
                        }, 1000);
                        
                        // Check and show date picker after upload
                        this.checkAndShowDatePicker();
                        
                        // Don't close the modal automatically - let user see the updated table and close manually
                        // Reset the form so user can upload another file if needed
                        if (csvFile) {
                            csvFile.value = '';
                        }
                        if (fileName) {
                            fileName.textContent = 'Choose CSV file...';
                        }
                        this.updateUploadButtonState();
                        
                        // Optional: Reload main data if on mood page (but don't close modal)
                        if (this.currentView === 'mood') {
                        setTimeout(() => {
                            this.loadData();
                            }, 2000);
                        }
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
        const lines = csvText.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV file is empty or invalid');
        }

        // Detect delimiter by checking first few lines
        const firstLine = lines[0];
        const secondLine = lines[1] || '';
        
        // Count occurrences of different delimiters
        const commaCount = (firstLine.match(/,/g) || []).length;
        const tabCount = (firstLine.match(/\t/g) || []).length;
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const pipeCount = (firstLine.match(/\|/g) || []).length;
        
        // Choose delimiter with most occurrences
        let delimiter = ',';
        let maxCount = commaCount;
        
        if (tabCount > maxCount) {
            delimiter = '\t';
            maxCount = tabCount;
        }
        if (semicolonCount > maxCount) {
            delimiter = ';';
            maxCount = semicolonCount;
        }
        if (pipeCount > maxCount) {
            delimiter = '|';
            maxCount = pipeCount;
        }
        
        console.log(`🔍 Detected delimiter: ${delimiter === '\t' ? 'TAB' : delimiter} (counts: comma=${commaCount}, tab=${tabCount}, semicolon=${semicolonCount}, pipe=${pipeCount})`);

        // Check if first line is a header (contains common header keywords)
        const firstLineUpper = firstLine.toUpperCase();
        const hasHeaderKeywords = firstLineUpper.includes('SYMBOL') || 
                                   firstLineUpper.includes('SERIES') || 
                                   firstLineUpper.includes('OPEN') || 
                                   firstLineUpper.includes('CLOSE') ||
                                   firstLineUpper.includes('NAME') ||
                                   firstLineUpper.includes('COMPANY');
        
        let headers;
        let startIndex = 0;
        
        if (hasHeaderKeywords) {
            // First line is a header - parse it
            if (delimiter === ',') {
                headers = this.parseCSVLine(firstLine).map(h => h.trim().replace(/^"|"$/g, '').toUpperCase());
            } else {
                headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').toUpperCase());
            }
            startIndex = 1;
            console.log(`✅ Detected CSV header row: ${headers.length} columns`);
        } else {
            // No header row - use standard NSE bhavcopy column mapping
            // Standard format: SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE, TOTTRDQTY, TOTTRDVAL, TIMESTAMP, ...
            const firstRowValues = delimiter === ',' ? this.parseCSVLine(firstLine) : firstLine.split(delimiter);
            const columnCount = firstRowValues.length;
            
            // Map columns to standard names
            headers = [];
            for (let i = 0; i < columnCount; i++) {
                if (i === 0) headers.push('SYMBOL');
                else if (i === 1) headers.push('SERIES');
                else if (i === 2) headers.push('OPEN');
                else if (i === 3) headers.push('HIGH');
                else if (i === 4) headers.push('LOW');
                else if (i === 5) headers.push('CLOSE');
                else if (i === 6) headers.push('LAST');
                else if (i === 7) headers.push('PREVCLOSE');
                else if (i === 8) headers.push('TOTTRDQTY');
                else if (i === 9) headers.push('TOTTRDVAL');
                else if (i === 10) headers.push('TIMESTAMP');
                else headers.push(`COL${i}`);
            }
            startIndex = 0;
            console.log(`⚠️ No CSV header detected, using standard mapping: ${headers.length} columns`);
        }
        
        console.log(`🔍 CSV headers (${headers.length} columns):`, headers.slice(0, 10));
        
        // Parse data rows
        const data = [];
        for (let i = startIndex; i < lines.length; i++) {
            let values;
            if (delimiter === ',') {
                values = this.parseCSVLine(lines[i]);
            } else {
                values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
            }
            
            if (values.length >= headers.length || values.length >= 6) {
                // At least need SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE
                const row = {};
                headers.forEach((header, index) => {
                    if (index < values.length) {
                        row[header] = values[index].trim().replace(/^"|"$/g, '');
                    }
                });
                data.push(row);
            } else if (values.length > 0 && i <= 3) {
                // Log mismatch for first few rows
                console.log(`⚠️ Row ${i} column count mismatch: expected ${headers.length}, got ${values.length}`, values.slice(0, 5));
            }
        }

        console.log(`📊 Parsed ${data.length} rows from CSV file`);
        if (data.length > 0) {
            console.log('🔍 First CSV row:', data[0]);
        }

        return data;
    }

    // parseDATFile removed - DAT files no longer supported. Use CSV files only.

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

    parseTabDelimitedFile(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('File is empty or invalid');
        }

        // Parse header
        const headers = lines[0].split('\t').map(h => h.trim().replace(/^"|"$/g, ''));
        
        console.log('🔍 Tab-delimited headers:', headers);
        
        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split('\t').map(v => v.trim().replace(/^"|"$/g, ''));
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                data.push(row);
            } else if (values.length > 0) {
                // Log mismatch for debugging
                if (i <= 3) {
                    console.log(`⚠️ Row ${i} column count mismatch: expected ${headers.length}, got ${values.length}`, values);
                }
            }
        }

        console.log(`📊 Parsed ${data.length} rows from tab-delimited file`);
        if (data.length > 0) {
            console.log('🔍 First tab-delimited row:', data[0]);
        }

        return data;
    }

    parseSpaceDelimitedFile(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('File is empty or invalid');
        }

        // Try to find header row by looking for common header keywords
        let headerIndex = 0;
        const headerKeywords = ['SYMBOL', 'SYM', 'STOCK', 'COMPANY', 'NAME'];
        
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const upperLine = lines[i].toUpperCase();
            if (headerKeywords.some(keyword => upperLine.includes(keyword))) {
                headerIndex = i;
                break;
            }
        }

        // Parse header - split by multiple spaces (2+ spaces)
        const headerLine = lines[headerIndex];
        const headers = headerLine.split(/\s{2,}/).map(h => h.trim().replace(/^"|"$/g, ''));
        
        console.log('🔍 Space-delimited headers:', headers);
        
        // Parse data rows
        const data = [];
        for (let i = headerIndex + 1; i < lines.length; i++) {
            const values = lines[i].split(/\s{2,}/).map(v => v.trim().replace(/^"|"$/g, ''));
            if (values.length >= headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                data.push(row);
            } else if (values.length > 0 && i <= headerIndex + 5) {
                console.log(`⚠️ Row ${i} column count mismatch: expected ${headers.length}, got ${values.length}`, values.slice(0, 5));
            }
        }

        console.log(`📊 Parsed ${data.length} rows from space-delimited file`);
        if (data.length > 0) {
            console.log('🔍 First space-delimited row:', data[0]);
        }

        return data;
    }

    /**
     * Robust parser for NSE Pre-Open Market CSV files
     * Format: Standard comma-separated CSV with quoted fields
     * Header: "SYMBOL","PREV. CLOSE","IEP","CHNG","%CHNG","FINAL","FINAL QUANTITY",...
     * Returns: { header: array, parsedRows: array }
     */
    parseNSEPremarketCSV(csvText, fileName) {
        console.log('📄 Parsing NSE premarket CSV (fixed parser):', fileName);
        
        // Helper function to properly parse CSV line with quoted fields
        const parseCSVLine = (line) => {
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
                } else if (char === ',' && !inQuotes) {
                    // End of value
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            // Add last value
            values.push(current.trim());
            return values;
        };
        
        // 1. Split by REAL line breaks, not commas
        const rawLines = csvText.split(/\r?\n/).map(l => l.trim());
        const nonEmptyLines = rawLines.filter(l => l.length > 0);
        
        if (nonEmptyLines.length === 0) {
            console.warn('No non-empty lines in premarket CSV');
            return { header: [], parsedRows: [] };
        }
        
        // Debug: Log first few lines to see actual format
        console.log('🔍 First line (first 500 chars):', nonEmptyLines[0]?.substring(0, 500));
        if (nonEmptyLines.length > 1) {
            console.log('🔍 Second line (first 200 chars):', nonEmptyLines[1]?.substring(0, 200));
        }
        
        // 2. First non-empty line is the header row
        const headerLine = nonEmptyLines[0];
        // Use proper CSV parser to handle quoted fields
        const headerCells = parseCSVLine(headerLine)
            .map(h => h.replace(/^"+|"+$/g, '').trim())
            .filter(h => h); // Remove empty cells
        
        console.log('🔍 Fixed header cells:', headerCells);
        console.log(`✅ Detected ${headerCells.length} columns`);
        
        // Debug: Test parsing on second line to verify it works
        if (nonEmptyLines.length > 1) {
            const testRow = parseCSVLine(nonEmptyLines[1]);
            console.log(`🔍 Test parsing second line: ${testRow.length} cells, first 5:`, testRow.slice(0, 5));
        }
        
        const parsedRows = [];
        
        for (let i = 1; i < nonEmptyLines.length; i++) {
            const line = nonEmptyLines[i];
            if (!line) continue;
            
            // Use proper CSV parser to handle quoted fields
            const cells = parseCSVLine(line)
                .map(c => c.replace(/^"+|"+$/g, '').trim());
            
            if (cells.length === 0) continue;
            
            const row = {};
            for (let j = 0; j < headerCells.length && j < cells.length; j++) {
                const key = headerCells[j];
                if (!key) continue;
                row[key] = cells[j];
            }
            
            const symbol = row['SYMBOL'] || row['Symbol'] || row['symbol'] || '';
            if (!symbol || symbol === 'SYMBOL' || symbol.toUpperCase().includes('SYMBOL')) {
                continue; // skip bad/header-like rows
            }
            
            // Skip footer rows
            if (symbol.includes('(₹ Crores)') || symbol.includes('52W') || symbol.length > 50) {
                continue;
            }
            
            parsedRows.push(row);
        }
        
        console.log(
            `✅ Fixed premarket parser: header=${JSON.stringify(headerCells)}, parsedRows.length=${parsedRows.length}`
        );
        
        if (parsedRows.length > 0) {
            console.log(`🔍 Sample row:`, {
                SYMBOL: parsedRows[0]['SYMBOL'],
                IEP: parsedRows[0]['IEP'],
                FINAL: parsedRows[0]['FINAL'],
                'PREV. CLOSE': parsedRows[0]['PREV. CLOSE']
            });
        }
        
        return {
            header: headerCells,
            parsedRows: parsedRows
        };
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

    // ---- SAFE CLEANER FOR BHAVCOPY VALUES ----
    cleanPrice(value) {
        if (value === null || value === undefined) return null;

        // Convert to string always
        const str = String(value).trim();
        if (!str) return null;   // handles "" without turning it into 0

        return parseFloat(str.replace(/,/g, ''));
    }
    // -------------------------------------------

    processBhavcopyData(csvData, date, fileName) {
        try {
            const indices = [];

            // counters
            let skippedNoSymbol = 0;
            let skippedNotEq = 0;
            let skippedInvalidClose = 0;

            // CSV bhavcopy files - detect by filename pattern or column structure
            // Expected NSE CSV bhavcopy patterns:
            // - sec_bhavdata_full_YYYYMMDD.csv
            // - cm*.csv
            const isBhavcopyCSV = fileName && (
                fileName.toUpperCase().includes('SEC_BHAVDATA') ||
                fileName.toUpperCase().includes('BHAVDATA') ||
                (fileName.toUpperCase().startsWith('CM') && fileName.toUpperCase().endsWith('.CSV'))
            );
            
            // Check if CSV has expected bhavcopy columns
            const hasBhavcopyColumns = csvData.length > 0 && csvData[0] && (
                csvData[0].SYMBOL || csvData[0].symbol ||
                csvData[0].OPEN || csvData[0].open ||
                csvData[0].CLOSE || csvData[0].close ||
                csvData[0].SERIES || csvData[0].series
            );
            
            if (isBhavcopyCSV || hasBhavcopyColumns) {
                console.log(`📊 Processing CSV bhavcopy file: ${fileName}`);
                if (csvData.length > 0) {
                    console.log(`🔍 First row keys:`, Object.keys(csvData[0]));
                    console.log(`🔍 First row sample:`, {
                        SYMBOL: csvData[0].SYMBOL || csvData[0].symbol,
                        SERIES: csvData[0].SERIES || csvData[0].series,
                        OPEN: csvData[0].OPEN || csvData[0].open,
                        CLOSE: csvData[0].CLOSE || csvData[0].close
                    });
                }
            }

            csvData.forEach((row, index) => {
                if (!row) return;

                // CSV bhavcopy uses standard field names: SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, etc.
                // Normalize field names (handle both uppercase and lowercase)
                const symbol = (row.SYMBOL || row.symbol || '').trim();
                const series = (row.SERIES || row.series || '').trim();
                const name = (row.NAME || row.name || symbol || '').trim(); // Optional name field
                const market = (row.MARKET || row.market || '').trim(); // Optional market field

                if (index < 3) {
                    console.log(`🔍 Row ${index} (CSV bhavcopy):`, { symbol, series, CLOSE: row.CLOSE || row.close });
                }

                // 1) Symbol check
                if (!symbol) {
                    skippedNoSymbol++;
                    return;
                }

                // 2) Series filter – only EQ (use uppercase for comparison)
                const seriesUpper = (series || '').toUpperCase().trim();
                if (seriesUpper !== 'EQ') {
                    skippedNotEq++;
                    return;
                }

                // 3) Price parsing: prefer CLOSE, fall back to LAST
                // Normalize field names (handle both uppercase and lowercase from CSV)
                const closeStr =
                    (row.CLOSE && String(row.CLOSE).trim()) ||
                    (row.close && String(row.close).trim()) ||
                    (row.LAST && String(row.LAST).trim()) ||
                    (row.last && String(row.last).trim()) ||
                    '';

                const openStr = 
                    (row.OPEN && String(row.OPEN).trim()) || 
                    (row.open && String(row.open).trim()) || 
                    '';
                const highStr = 
                    (row.HIGH && String(row.HIGH).trim()) || 
                    (row.high && String(row.high).trim()) || 
                    '';
                const lowStr = 
                    (row.LOW && String(row.LOW).trim()) || 
                    (row.low && String(row.low).trim()) || 
                    '';

                const prevCloseStr =
                    (row.PREVCLOSE && String(row.PREVCLOSE).trim()) ||
                    (row.prevClose && String(row.prevClose).trim()) ||
                    (row.PREV_CLOSE && String(row.PREV_CLOSE).trim()) ||
                    closeStr;

                // Remove commas and parse as float
                const close = this.cleanPrice(closeStr);
                const open = this.cleanPrice(openStr);
                const high = this.cleanPrice(highStr);
                const low = this.cleanPrice(lowStr);
                const prevClose = this.cleanPrice(prevCloseStr);

                if (close === null || !Number.isFinite(close) || close <= 0) {
                    skippedInvalidClose++;
                    return;
                }

                indices.push({
                    symbol,
                    series: seriesUpper, // Use uppercase series
                    date,
                    open: Number.isFinite(open) ? open : null,
                    high: Number.isFinite(high) ? high : null,
                    low: Number.isFinite(low) ? low : null,
                    close,
                    prevClose: Number.isFinite(prevClose) ? prevClose : null,
                    raw: row
                });
            });

            console.log(`📊 Processed ${indices.length} EQ stocks from bhavcopy CSV file: ${fileName}`);
            console.log(
                `   Skipped: ${skippedNoSymbol} (no symbol), ` +
                `${skippedNotEq} (not EQ), ` +
                `${skippedInvalidClose} (invalid close)`
            );

            if (indices.length === 0) {
                console.warn(
                    `⚠️ WARNING: No EQ stocks processed from ${csvData.length} parsed rows in ${fileName}!`
                );
                console.warn(`   Debug info:`, {
                    isDatLayout,
                    firstRowKeys: csvData.length > 0 ? Object.keys(csvData[0]) : [],
                    firstRowSample: csvData.length > 0 ? {
                        NAME: csvData[0].NAME,
                        SYMBOL: csvData[0].SYMBOL,
                        SERIES: csvData[0].SERIES,
                        COL2: csvData[0].COL2,
                        COL3: csvData[0].COL3
                    } : null
                });
            } else {
                // Log sample of processed items
                console.log(`✅ Sample processed items (first 3):`, indices.slice(0, 3).map(item => ({
                    symbol: item.symbol,
                    series: item.series,
                    close: item.close
                })));
            }

            // Return in the expected format
            return {
                mood: null, // Bhavcopy doesn't have mood data
                indices: indices,
                vix: null,
                advanceDecline: { advances: 0, declines: 0 },
                timestamp: new Date(date).toISOString(),
                source: 'uploaded',
                fileName: fileName,
                date: date
            };
        } catch (err) {
            console.error('❌ Error while processing bhavcopy data:', err, fileName);
            return {
                mood: null,
                indices: [],
                vix: null,
                advanceDecline: { advances: 0, declines: 0 },
                timestamp: new Date(date).toISOString(),
                source: 'uploaded',
                fileName: fileName,
                date: date
            };
        }
    }

    processPremarketData(csvData, date, fileName) {
        // Process NSE premarket data - standard format: SYMBOL, PREV. CLOSE, IEP, CHNG, %CHNG, FINAL, etc.
        const indices = [];
        
        console.log(`📊 Processing ${csvData.length} rows from NSE premarket CSV: ${fileName}`);
        
        // Debug: Log first row to see what fields are available
        if (csvData.length > 0) {
            console.log(`🔍 First row keys:`, Object.keys(csvData[0]));
            console.log(`🔍 First row sample:`, csvData[0]);
        }
        
        let skippedCount = 0;
        csvData.forEach((row, index) => {
            // NSE premarket CSV uses uppercase field names
            const symbol = row['SYMBOL'] || row['Symbol'] || row['symbol'] || '';
            
            // Use IEP (Indian Equity Price) or FINAL as the pre-open price
            // IEP is the indicative equilibrium price, FINAL is the final pre-open price
            let price = 0;
            const priceStr = row['FINAL'] || row['IEP'] || row['final'] || row['iep'] || 
                           row['PRE_OPEN_PRICE'] || row['Pre Open Price'] || '';
            
            if (priceStr) {
                price = parseFloat(String(priceStr).replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./g, '').trim());
            }
            
            // Fallback: try PREV. CLOSE if FINAL/IEP not available
            if (isNaN(price) || price <= 0) {
                const prevCloseStr = row['PREV. CLOSE'] || row['PREV_CLOSE'] || row['Prev Close'] || '';
                if (prevCloseStr) {
                    price = parseFloat(String(prevCloseStr).replace(/,/g, '').trim());
                }
            }
            
            const change = parseFloat((row['CHNG'] || row['CHANGE'] || row['Change'] || '0').replace(/,/g, '').trim());
            const changePercent = parseFloat((row['%CHNG'] || row['% Change'] || row['Change(%)'] || '0').replace(/,/g, '').replace(/%/g, '').trim());
            const volume = parseFloat((row['FINAL QUANTITY'] || row['FINAL_QUANTITY'] || row['Volume'] || row['VOLUME'] || '0').replace(/,/g, '').trim());

            // Skip invalid rows
            if (!symbol || symbol.trim() === '' || symbol.length > 50) {
                skippedCount++;
                if (index < 3) {
                    console.log(`⚠️ Row ${index} skipped: invalid symbol`, { symbol, rowKeys: Object.keys(row) });
                }
                return;
            }

            if (isNaN(price) || price <= 0) {
                skippedCount++;
                if (index < 3) {
                    console.log(`⚠️ Row ${index} skipped: invalid price`, { 
                        symbol, 
                        FINAL: row['FINAL'], 
                        IEP: row['IEP'],
                        'PREV. CLOSE': row['PREV. CLOSE'],
                        priceStr: priceStr,
                        allRowKeys: Object.keys(row)
                    });
                }
                return;
            }

            indices.push({
                symbol: symbol.trim().toUpperCase(),
                price: price,
                pre_open_price: price,
                PRE_OPEN_PRICE: price,
                change: change || 0,
                changePercent: changePercent || 0,
                volume: volume || 0,
                // Include normalized field names for compatibility
                SYMBOL: symbol.trim().toUpperCase(),
                PRICE: price,
                PRE_OPEN_PRICE: price,
                preOpenPrice: price,
                last_price: price,
                LAST_PRICE: price,
                close: price,
                CLOSE: price,
                // Include original NSE fields
                'PREV. CLOSE': row['PREV. CLOSE'] || '',
                IEP: row['IEP'] || '',
                FINAL: row['FINAL'] || '',
                CHNG: row['CHNG'] || '',
                '%CHNG': row['%CHNG'] || ''
            });
        });

        console.log(`✅ Processed ${indices.length} stocks from NSE premarket file: ${fileName} (skipped ${skippedCount} rows)`);
        console.log(`📅 Date used: ${date}`);
        
        if (indices.length === 0 && csvData.length > 0) {
            console.warn(`⚠️ WARNING: No stocks processed from ${csvData.length} parsed rows! Check field names.`);
        }

        return {
            mood: null, // Premarket doesn't have mood data
            indices: indices,
            vix: null,
            advanceDecline: { advances: 0, declines: 0 },
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
            const processedCount = data.count || data.indicesCount || (Array.isArray(data.indices) ? data.indices.length : 0);
            const indicesArray = data.indices || [];
            
            // Enhanced logging for bhavcopy
            if (type === 'bhav') {
                console.log(`🔍 SAVING BHAVCOPY TO DB:`, {
                    fileName,
                    date: dataDate,
                    processedCount: processedCount,
                    indicesArrayLength: indicesArray.length,
                    indicesCount: data.indicesCount,
                    count: data.count,
                    hasIndices: Array.isArray(indicesArray),
                    sampleItem: indicesArray.length > 0 ? {
                        symbol: indicesArray[0].symbol,
                        series: indicesArray[0].series,
                        close: indicesArray[0].close,
                        hasRaw: !!indicesArray[0].raw
                    } : null
                });
                
                // Guard: Don't save if no processed rows
                if (processedCount === 0 || indicesArray.length === 0) {
                    console.warn(`⚠️ Skipping save to MongoDB: bhavcopy has 0 processed EQ stocks.`);
                    console.warn(`   File: ${fileName}, Date: ${dataDate}`);
                    console.warn(`   Check: 1) Header mapping (SERIES should be at index 2), 2) EQ filter, 3) Close price validation`);
                    return { success: false, error: 'No rows processed', skipped: true };
                }
                
                // Validate data structure before sending
                const validItems = indicesArray.filter(item => 
                    item && 
                    (item.symbol || item.SYMBOL) && 
                    item.series === 'EQ' && 
                    (item.close !== null && item.close !== undefined)
                );
                
                if (validItems.length === 0) {
                    console.warn(`⚠️ Skipping save: No valid EQ items found after validation.`);
                    console.warn(`   Total items: ${indicesArray.length}, Valid items: ${validItems.length}`);
                    return { success: false, error: 'No valid EQ items', skipped: true };
                }
                
                console.log(`✅ Validated ${validItems.length} EQ items ready for database save`);
            }
            
            // Debug logging for premarket
            if (type === 'premarket') {
                console.log(`🔍 SAVING PREMARKET TO DB:`, {
                    fileName,
                    date: dataDate,
                    indicesCount: data.indicesCount,
                    count: data.count,
                    dateDataPremarketCount: data.dateDataPremarketCount,
                    indicesArrayLength: indicesArray.length
                });
            }
            
            // CRITICAL: Ensure indicesArray is always a valid array
            if (!Array.isArray(indicesArray)) {
                console.error(`❌ Invalid indicesArray:`, indicesArray);
                indicesArray = [];
            }
            
            // Calculate count from actual array length (don't trust stored values)
            const actualIndicesCount = indicesArray.length;
            
            // For bhavcopy, validate we have data before sending
            if (type === 'bhav' && actualIndicesCount === 0) {
                console.warn(`⚠️ Cannot save bhavcopy: indicesArray is empty`);
                console.warn(`   File: ${fileName}, Date: ${dataDate}`);
                throw new Error('Bhavcopy has 0 processed EQ stocks - cannot save to database');
            }
            
            const payload = {
                fileName: fileName || 'uploaded.csv',
                date: dataDate || new Date().toISOString().split('T')[0],
                type: type || 'indices',
                indices: indicesArray, // Always send the actual array
                indicesCount: actualIndicesCount, // Always calculate from array length
                count: actualIndicesCount,
                dateDataPremarketCount: data.dateDataPremarketCount || actualIndicesCount,
                header: data.header || null,
                mood: data.mood,
                vix: data.vix,
                advanceDecline: data.advanceDecline,
                timestamp: data.timestamp || new Date().toISOString(),
                source: data.source || 'uploaded'
            };
            
            // Debug log before sending
            if (type === 'bhav') {
                console.log(`📤 Sending bhavcopy to backend:`, {
                    fileName: payload.fileName,
                    date: payload.date,
                    indicesArrayLength: indicesArray.length,
                    indicesCount: payload.indicesCount,
                    sampleItem: indicesArray.length > 0 ? {
                        symbol: indicesArray[0].symbol,
                        series: indicesArray[0].series,
                        close: indicesArray[0].close
                    } : null
                });
            }
            
            const response = await fetch('/api/save-uploaded-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    if (type === 'bhav') {
                        console.log(`✅ Bhavcopy saved to MongoDB successfully!`);
                        console.log(`   Document ID: ${result.id}`);
                        console.log(`   Date: ${dataDate}`);
                        console.log(`   EQ Stocks: ${result.dailyInsertCount || processedCount}`);
                        console.log(`   File: ${fileName}`);
                    } else {
                        console.log('✅ Data saved to MongoDB:', result.id);
                    }
                    if (result.warning) {
                        console.warn('⚠️', result.warning);
                    }
                    if (result.dailyInsertCount !== undefined) {
                        console.log(`   Daily collection insert count: ${result.dailyInsertCount}`);
                    }
                } else {
                    console.warn('⚠️ Database save returned:', result);
                }
                return result;
            } else {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                const errorMsg = errorData.message || `Failed to save: ${response.statusText}`;
                console.error(`❌ Database save failed (${response.status}):`, errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('❌ Error saving to database:', error);
            if (type === 'bhav') {
                console.error('   Bhavcopy save failed. Check:');
                console.error('   1. MongoDB connection (MONGODB_URI environment variable)');
                console.error('   2. Data format (indices array structure)');
                console.error('   3. Network connectivity');
            }
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

    async checkBhavcopyUploadHistory() {
        try {
            console.log('🔍 Checking bhavcopy upload history...');
            const response = await fetch('/api/save-uploaded-data?type=bhav');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data && result.data.length > 0) {
                // Sort by uploadedAt (most recent first)
                const sortedData = result.data.sort((a, b) => {
                    const dateA = new Date(a.uploadedAt || 0);
                    const dateB = new Date(b.uploadedAt || 0);
                    return dateB - dateA;
                });
                
                console.log(`\n📊 BHAVCOPY UPLOAD HISTORY (${sortedData.length} uploads):\n`);
                
                const validUploads = [];
                const invalidUploads = [];
                
                sortedData.forEach((item, index) => {
                    const uploadDate = new Date(item.uploadedAt);
                    const uploadTime = uploadDate.toLocaleString();
                    const count = item.indicesCount || 0;
                    const status = count > 0 ? '✅ VALID' : '❌ INVALID (0 stocks)';
                    
                    console.log(`${index + 1}. Date: ${item.date} - ${status}`);
                    console.log(`   File: ${item.fileName}`);
                    console.log(`   EQ Stocks: ${count}`);
                    console.log(`   Uploaded: ${uploadTime}`);
                    console.log(`   ID: ${item.id}`);
                    if (count === 0) {
                        console.log(`   ⚠️  Issue: Processing failed - check header mapping and EQ filter`);
                    }
                    console.log('');
                    
                    if (count > 0) {
                        validUploads.push(item);
                    } else {
                        invalidUploads.push(item);
                    }
                });
                
                console.log(`\n📈 SUMMARY:`);
                console.log(`   ✅ Valid uploads (count > 0): ${validUploads.length}`);
                console.log(`   ❌ Invalid uploads (count = 0): ${invalidUploads.length}`);
                
                if (validUploads.length > 0) {
                    const lastValidUpload = validUploads[0];
                    console.log(`\n✅ LAST VALID BHAVCOPY UPLOAD:`);
                    console.log(`   📅 Date: ${lastValidUpload.date}`);
                    console.log(`   📁 File: ${lastValidUpload.fileName}`);
                    console.log(`   📈 EQ Stocks: ${lastValidUpload.indicesCount || 0}`);
                    console.log(`   ⏰ Uploaded: ${new Date(lastValidUpload.uploadedAt).toLocaleString()}`);
                } else {
                    console.log(`\n⚠️  NO VALID BHAVCOPY UPLOADS FOUND!`);
                    console.log(`   All ${sortedData.length} uploads have 0 processed stocks.`);
                    console.log(`   This means processing is failing.`);
                    console.log(`   Possible causes:`);
                    console.log(`   1. Header mapping issue (SERIES not at index 2)`);
                    console.log(`   2. EQ filter too strict`);
                    console.log(`   3. Close price validation failing`);
                    console.log(`   Solution: Clear browser cache and re-upload with fixed code.`);
                }
                
                return {
                    success: true,
                    total: sortedData.length,
                    valid: validUploads.length,
                    invalid: invalidUploads.length,
                    lastValidUpload: validUploads.length > 0 ? validUploads[0] : null,
                    lastUpload: sortedData[0],
                    allUploads: sortedData
                };
            } else {
                console.log('⚠️ No bhavcopy uploads found in database.');
                return {
                    success: true,
                    total: 0,
                    valid: 0,
                    invalid: 0,
                    lastValidUpload: null,
                    lastUpload: null,
                    allUploads: []
                };
            }
        } catch (error) {
            console.error('❌ Error checking bhavcopy history:', error);
            return {
                success: false,
                error: error.message
            };
        }
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
        
        // Get today's date string for comparison
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // Current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;
            dayEl.setAttribute('data-date', dateStr);
            
            let score = null;
            let hasData = false;
            
            // Check if this is today and we have current mood data
            if (isToday && this.lastMarketData && this.lastMarketData.mood && typeof this.lastMarketData.mood.score === 'number') {
                // Use current mood score for today
                score = this.lastMarketData.mood.score;
                hasData = true;
                dayEl.classList.add('has-data');
                console.log('📅 Calendar: Using current mood score for today:', score);
            } else if (this.availableDates.includes(dateStr)) {
                // Check if date has uploaded data
                hasData = true;
                dayEl.classList.add('has-data');
                
                // Add mood color class based on mood string or score
                const moodData = this.availableDatesData.get(dateStr);
                if (moodData) {
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
                }
            } else {
                dayEl.classList.add('no-data');
                    }
                    
            // Apply mood color class based on score
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
                
                // Add click handler
                dayEl.addEventListener('click', () => {
                    this.selectCalendarDate(dateStr);
                });
            
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
        
        // Hide action buttons when table is cleared
        const actionButtons = document.getElementById('tableActionButtons');
        if (actionButtons) {
            actionButtons.style.display = 'none';
        }
        
        // Reset select all checkbox
        const selectAllCheckbox = document.getElementById('selectAllRows');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        
        // Debug: Log when function is called
        console.log('updateUploadedDataInfo called');
        console.log('Table body cleared, child count:', tableBody.children.length);

        try {
            // Fetch all uploaded files from all 5 collections
            const [indicesResponse, bhavResponse, premarketResponse, marketActivityResponse, week52Response] = await Promise.all([
                fetch('/api/save-uploaded-data?type=indices').catch(err => {
                    console.error('Error fetching indices data:', err);
                    return { ok: false, json: async () => ({ success: false, data: [] }) };
                }),
                fetch('/api/save-uploaded-data?type=bhav').catch(err => {
                    console.error('Error fetching bhav data:', err);
                    return { ok: false, json: async () => ({ success: false, data: [] }) };
                }),
                fetch('/api/save-uploaded-data?type=premarket').catch(err => {
                    console.error('Error fetching premarket data:', err);
                    return { ok: false, json: async () => ({ success: false, data: [] }) };
                }),
                fetch('/api/save-uploaded-data?type=marketactivity').catch(err => {
                    console.error('Error fetching market activity data:', err);
                    return { ok: false, json: async () => ({ success: false, data: [] }) };
                }),
                fetch('/api/save-uploaded-data?type=52w').catch(err => {
                    console.error('Error fetching 52W data:', err);
                    return { ok: false, json: async () => ({ success: false, data: [] }) };
                })
            ]);

            // Parse responses with error handling
            let indicesResult = { success: false, data: [] };
            let bhavResult = { success: false, data: [] };
            let premarketResult = { success: false, data: [] };
            let marketActivityResult = { success: false, data: [] };
            let week52Result = { success: false, data: [] };

            try {
                if (indicesResponse.ok) {
                    indicesResult = await indicesResponse.json();
                } else {
                    console.warn('Indices API returned non-OK status:', indicesResponse.status);
                }
            } catch (err) {
                console.error('Error parsing indices response:', err);
            }

            try {
                if (bhavResponse.ok) {
                    bhavResult = await bhavResponse.json();
                } else {
                    console.warn('Bhav API returned non-OK status:', bhavResponse.status);
                }
            } catch (err) {
                console.error('Error parsing bhav response:', err);
            }

            try {
                if (premarketResponse.ok) {
                    premarketResult = await premarketResponse.json();
                } else {
                    console.warn('Premarket API returned non-OK status:', premarketResponse.status);
                }
            } catch (err) {
                console.error('Error parsing premarket response:', err);
            }

            try {
                if (marketActivityResponse.ok) {
                    marketActivityResult = await marketActivityResponse.json();
                } else {
                    console.warn('Market Activity API returned non-OK status:', marketActivityResponse.status);
                }
            } catch (err) {
                console.error('Error parsing market activity response:', err);
            }

            try {
                if (week52Response.ok) {
                    week52Result = await week52Response.json();
                } else {
                    console.warn('52W API returned non-OK status:', week52Response.status);
                }
            } catch (err) {
                console.error('Error parsing 52W response:', err);
            }

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
                                marketactivity: { count: 0, id: null },
                                week52: { count: 0, id: null },
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
                                marketactivity: { count: 0, id: null },
                                week52: { count: 0, id: null },
                                uploadedAt: file.uploadedAt
                            });
                        }
                        const dateData = dateMap.get(normalizedDate);
                        const count = file.indicesCount || (Array.isArray(file.indices) ? file.indices.length : 0);
                        
                        // Debug log for bhav data
                        if (normalizedDate === '2025-12-11' || normalizedDate === '2025-12-10' || normalizedDate === '2025-12-01') {
                            console.log(`🔍 Bhav data for ${normalizedDate}:`, {
                                fileId: file.id,
                                fileName: file.fileName,
                                indicesCount: file.indicesCount,
                                indicesArrayLength: Array.isArray(file.indices) ? file.indices.length : 'not array',
                                finalCount: count,
                                dateDataCurrentCount: dateData.bhav.count
                            });
                        }
                        
                        // Only update if count > 0 (valid processed data exists)
                        // Don't set ID or count for files with 0 processed rows (failed processing)
                        if (count > 0) {
                            // Update if count is higher OR if no valid ID is set yet
                            if (count > dateData.bhav.count || !dateData.bhav.id || dateData.bhav.count === 0) {
                                dateData.bhav.count = count;
                                dateData.bhav.id = file.id;
                            }
                        } else {
                            // Count is 0 - this means processing failed
                            // Don't overwrite existing valid data, but log for debugging
                            if (normalizedDate === '2025-12-11' || normalizedDate === '2025-12-10') {
                                console.warn(`⚠️ Bhavcopy file with 0 count found for ${normalizedDate}:`, {
                                    fileId: file.id,
                                    fileName: file.fileName,
                                    reason: 'Processing likely failed - check header mapping and EQ filter'
                                });
                            }
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
                                marketactivity: { count: 0, id: null },
                                week52: { count: 0, id: null },
                                uploadedAt: file.uploadedAt
                            });
                        }
                        const dateData = dateMap.get(normalizedDate);
                        // For premarket, check multiple possible fields for count
                        // Priority: dateDataPremarketCount > count > indicesCount > indices array length
                        let count = 0;
                        if (file.dateDataPremarketCount !== undefined && file.dateDataPremarketCount !== null) {
                            count = file.dateDataPremarketCount;
                        } else if (file.count !== undefined && file.count !== null) {
                            count = file.count;
                        } else if (file.indicesCount !== undefined && file.indicesCount !== null) {
                            count = file.indicesCount;
                        } else if (Array.isArray(file.indices) && file.indices.length > 0) {
                            count = file.indices.length;
                        }
                        
                        // Debug log for premarket data
                        if (normalizedDate === '2025-12-11' || normalizedDate === '2025-12-10') {
                            console.log(`🔍 Premarket data for ${normalizedDate}:`, {
                                fileId: file.id,
                                fileName: file.fileName,
                                dateDataPremarketCount: file.dateDataPremarketCount,
                                count: file.count,
                                indicesCount: file.indicesCount,
                                indicesArray: Array.isArray(file.indices) ? file.indices.length : 'not array',
                                finalCount: count,
                                dateDataCurrentCount: dateData.premarket.count
                            });
                        }
                        
                        // Always update if count is higher OR if no ID is set yet (file exists)
                        if (count > dateData.premarket.count || !dateData.premarket.id) {
                            dateData.premarket.count = count;
                            dateData.premarket.id = file.id;
                            dateData.dateDataPremarketCount = count;
                        }
                        // Keep the most recent uploadedAt
                        if (new Date(file.uploadedAt) > new Date(dateData.uploadedAt)) {
                            dateData.uploadedAt = file.uploadedAt;
                        }
                    }
                });
            }

            // Process market activity data
            if (marketActivityResult.success && marketActivityResult.data) {
                marketActivityResult.data.forEach(file => {
                    const normalizedDate = normalizeDate(file.date);
                    if (normalizedDate) {
                        if (!dateMap.has(normalizedDate)) {
                            dateMap.set(normalizedDate, {
                                date: normalizedDate,
                                indices: { count: 0, id: null },
                                bhav: { count: 0, id: null },
                                premarket: { count: 0, id: null },
                                marketactivity: { count: 0, id: null },
                                week52: { count: 0, id: null },
                                uploadedAt: file.uploadedAt
                            });
                        }
                        const dateData = dateMap.get(normalizedDate);
                        const count = file.indicesCount || (Array.isArray(file.indices) ? file.indices.length : 0);
                        if (count > 0 && (count > dateData.marketactivity.count || !dateData.marketactivity.id)) {
                            dateData.marketactivity.count = count;
                            dateData.marketactivity.id = file.id;
                        }
                        if (new Date(file.uploadedAt) > new Date(dateData.uploadedAt)) {
                            dateData.uploadedAt = file.uploadedAt;
                        }
                    }
                });
            }

            // Process 52W data
            if (week52Result.success && week52Result.data) {
                week52Result.data.forEach(file => {
                    const normalizedDate = normalizeDate(file.date);
                    if (normalizedDate) {
                        if (!dateMap.has(normalizedDate)) {
                            dateMap.set(normalizedDate, {
                                date: normalizedDate,
                                indices: { count: 0, id: null },
                                bhav: { count: 0, id: null },
                                premarket: { count: 0, id: null },
                                marketactivity: { count: 0, id: null },
                                week52: { count: 0, id: null },
                                uploadedAt: file.uploadedAt
                            });
                        }
                        const dateData = dateMap.get(normalizedDate);
                        const count = file.indicesCount || (Array.isArray(file.indices) ? file.indices.length : 0);
                        if (count > 0 && (count > dateData.week52.count || !dateData.week52.id)) {
                            dateData.week52.count = count;
                            dateData.week52.id = file.id;
                        }
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
                marketactivity: data.marketactivity.count,
                week52: data.week52.count
            })));
            
            // Log summary for all dates
            console.log('📊 Data summary by date:');
            dateMap.forEach((dateData, dateKey) => {
                console.log(`  ${dateKey}: indices=${dateData.indices.count}, bhav=${dateData.bhav.count}, premarket=${dateData.premarket.count}, ma=${dateData.marketactivity.count}, 52w=${dateData.week52.count}`);
            });

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
                // Removed rowNumber tracking - No column removed
                
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
                    
                    // No column removed - no need to track row number
                    
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
                    
                    // Check if data types have data
                    // Show checkmark ONLY if count > 0 AND id exists (data was actually parsed and stored)
                    const hasBhav = (dateData.bhav?.count || 0) > 0 && dateData.bhav?.id;
                    const hasPremarket = (dateData.premarket?.count || 0) > 0 && dateData.premarket?.id;
                    const hasMarketActivity = (dateData.marketactivity?.count || 0) > 0 && dateData.marketactivity?.id;
                    const hasWeek52 = (dateData.week52?.count || 0) > 0 && dateData.week52?.id;
                    
                    // Debug log for rendering
                    console.log(
                        `🎯 Rendering row for ${normalizedDate}: hasPremarket=${hasPremarket}, premarket=${dateData.premarket?.count || 0}, premarketId=${dateData.premarket?.id || 'none'}`
                    );
                    
                    // SVG icons for bhav status
                    const bhavCheckIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>`;
                    const bhavXIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>`;
                    
                    row.innerHTML = `
                        <td style="text-align: center;">
                            <input type="radio" class="row-radio" name="row-${index}" data-date="${dateData.date}" data-indices-id="${dateData.indices?.id || ''}" data-bhav-id="${dateData.bhav?.id || ''}" data-premarket-id="${dateData.premarket?.id || ''}" data-marketactivity-id="${dateData.marketactivity?.id || ''}" data-week52-id="${dateData.week52?.id || ''}">
                        </td>
                        <td style="color: ${dateColor};">${formattedDate}</td>
                        <td style="color: ${(dateData.indices?.count || 0) > 0 ? dateColor : '#999'};">${dateData.indices?.count || 0}</td>
                        <td style="text-align: center; vertical-align: middle;" title="${hasBhav ? 'Bhavcopy data available' : 'No bhavcopy data uploaded'}">${hasBhav ? bhavCheckIcon : bhavXIcon}</td>
                        <td style="text-align: center; vertical-align: middle;" title="${hasPremarket ? 'Premarket data available' : 'No premarket data uploaded'}">${hasPremarket ? bhavCheckIcon : bhavXIcon}</td>
                        <td style="text-align: center; vertical-align: middle;" title="${hasMarketActivity ? 'Market Activity data available' : 'No Market Activity data uploaded'}">${hasMarketActivity ? bhavCheckIcon : bhavXIcon}</td>
                        <td style="text-align: center; vertical-align: middle;" title="${hasWeek52 ? '52W High/Low data available' : 'No 52W data uploaded'}">${hasWeek52 ? bhavCheckIcon : bhavXIcon}</td>
                    `;
                    
                    // Store row data for easy access
                    row.dataset.date = dateData.date;
                    row.dataset.indicesId = dateData.indices?.id || '';
                    row.dataset.bhavId = dateData.bhav?.id || '';
                    row.dataset.premarketId = dateData.premarket?.id || '';
                    row.dataset.marketactivityId = dateData.marketactivity?.id || '';
                    row.dataset.week52Id = dateData.week52?.id || '';
                    
                    // Final check before appending - ensure this date hasn't been added
                    const existingRows = Array.from(tableBody.querySelectorAll('tr'));
                    const dateAlreadyInTable = existingRows.some(tr => {
                        const dateCell = tr.querySelector('td:nth-child(2)'); // Date is now in 2nd column (after radio, No column removed)
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
                    console.log(`Added row ${index + 1} for date: ${normalizedDate}`);
                });
                
                // Final verification - check for any duplicates in the rendered table
                const finalRows = Array.from(tableBody.querySelectorAll('tr'));
                const finalDates = new Set();
                finalRows.forEach((row, idx) => {
                    const dateCell = row.querySelector('td:nth-child(2)'); // Date is now in 2nd column (after radio, No column removed)
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

                // Setup row selection handlers
                this.setupRowSelectionHandlers();
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

    setupRowSelectionHandlers() {
        const tableBody = document.getElementById('uploadedFilesTableBody');
        const selectAllCheckbox = document.getElementById('selectAllRows');
        const actionButtons = document.getElementById('tableActionButtons');
        const btnExportSelected = document.getElementById('btnExportSelected');
        const btnDeleteSelected = document.getElementById('btnDeleteSelected');

        if (!tableBody) return;

        // Handle select all checkbox (naturally supports toggle)
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                const allRadios = tableBody.querySelectorAll('.row-radio');
                
                // Select or deselect all based on checkbox state
                allRadios.forEach(radio => {
                    radio.checked = isChecked;
                });
                
                // Update button visibility immediately
                this.updateActionButtonsVisibility();
            });
        }

        // Handle individual row radio buttons (allow multiple selection and toggle unselect)
        // Use mousedown to capture state before radio's default behavior
        tableBody.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('row-radio')) {
                // Store if it was checked before the click
                e.target.dataset.wasChecked = e.target.checked;
            }
        });
        
        // Handle click to implement toggle behavior for radio buttons
        tableBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('row-radio')) {
                const wasChecked = e.target.dataset.wasChecked === 'true';
                
                // If it was already checked, uncheck it (toggle off)
                if (wasChecked) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.target.checked = false;
                    delete e.target.dataset.wasChecked;
                }
                
                // Update select all and button visibility
                setTimeout(() => {
                    if (selectAllCheckbox) {
                        const allRadios = tableBody.querySelectorAll('.row-radio');
                        const checkedCount = tableBody.querySelectorAll('.row-radio:checked').length;
                        selectAllCheckbox.checked = checkedCount === allRadios.length && allRadios.length > 0;
                    }
                    this.updateActionButtonsVisibility();
                }, 10);
            }
        });
        
        // Also handle change event as fallback
        tableBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('row-radio')) {
                // Update select all radio state
                if (selectAllCheckbox) {
                    const allRadios = tableBody.querySelectorAll('.row-radio');
                    const checkedCount = tableBody.querySelectorAll('.row-radio:checked').length;
                    selectAllCheckbox.checked = checkedCount === allRadios.length && allRadios.length > 0;
                }
                this.updateActionButtonsVisibility();
            }
        });

        // Handle export selected
        if (btnExportSelected) {
            btnExportSelected.addEventListener('click', () => {
                const selectedRows = this.getSelectedRows();
                if (selectedRows.length === 0) {
                    this.showUploadStatus('Please select at least one row to export', 'error');
                    return;
                }

                // Export each selected date
                selectedRows.forEach(row => {
                    const date = row.dataset.date;
                    if (date) {
                        this.exportCSV(null, date);
                    }
                });
            });
        }

        // Handle delete selected
        if (btnDeleteSelected) {
            btnDeleteSelected.addEventListener('click', async () => {
                const selectedRows = this.getSelectedRows();
                if (selectedRows.length === 0) {
                    this.showUploadStatus('Please select at least one row to delete', 'error');
                    return;
                }

                const dates = selectedRows.map(row => row.dataset.date).filter(Boolean);
                if (dates.length === 0) {
                    this.showUploadStatus('No valid dates selected', 'error');
                    return;
                }

                if (!confirm(`Delete all uploaded data for ${dates.length} selected date(s)?`)) {
                    return;
                }

                // Delete all selected rows
                for (const row of selectedRows) {
                    const date = row.dataset.date;
                    const indicesId = row.dataset.indicesId;
                    const bhavId = row.dataset.bhavId;
                    const premarketId = row.dataset.premarketId;
                    const marketActivityId = row.dataset.marketactivityId;
                    const week52Id = row.dataset.week52Id;

                    const idsToDelete = [
                        { id: indicesId, type: 'indices' },
                        { id: bhavId, type: 'bhav' },
                        { id: premarketId, type: 'premarket' },
                        { id: marketActivityId, type: 'marketactivity' },
                        { id: week52Id, type: '52w' }
                    ].filter(item => item.id);

                    for (const item of idsToDelete) {
                        await this.deleteUploadedFile(item.id, item.type);
                    }
                }

                // Refresh the table
                this.updateUploadedDataInfo();
            });
        }
    }

    getSelectedRows() {
        const tableBody = document.getElementById('uploadedFilesTableBody');
        if (!tableBody) return [];
        
        const selectedRadios = tableBody.querySelectorAll('.row-radio:checked');
        return Array.from(selectedRadios).map(radio => {
            return radio.closest('tr');
        }).filter(Boolean);
    }

    updateActionButtonsVisibility() {
        const actionButtons = document.getElementById('tableActionButtons');
        const selectedCount = this.getSelectedRows().length;
        
        console.log('🔍 updateActionButtonsVisibility called:', { 
            selectedCount, 
            actionButtons: !!actionButtons,
            element: actionButtons 
        });
        
        if (actionButtons) {
            if (selectedCount > 0) {
                actionButtons.style.display = 'flex';
                console.log('✅ Showing action buttons - selectedCount:', selectedCount);
            } else {
                actionButtons.style.display = 'none';
                console.log('❌ Hiding action buttons - no selection');
            }
        } else {
            console.error('⚠️ tableActionButtons element not found! Check HTML structure.');
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

    /**
     * Centralized function to control view switching
     * Ensures page views are siblings and properly visible/hidden
     */
    setActiveView(active) {
        const moodPageView = document.getElementById('moodPageView');
        const signalsPageView = document.getElementById('signalsPageView');
        const moodBtn = document.getElementById('moodBtn');
        const signalsBtn = document.getElementById('signalsBtn');

        if (!moodPageView || !signalsPageView) {
            console.warn('setActiveView: missing page views', {
                moodPageView: !!moodPageView,
                signalsPageView: !!signalsPageView,
            });
            return;
        }

        // Ensure they are siblings, not nested
        if (signalsPageView.parentElement === moodPageView && moodPageView.parentElement) {
            console.log('Fixing nested structure: moving signalsPageView to be sibling of moodPageView');
            moodPageView.parentElement.insertBefore(signalsPageView, moodPageView.nextSibling);
        }

        // Clean up old inline display so we fully control it
        moodPageView.style.removeProperty('display');
        signalsPageView.style.removeProperty('display');
        moodPageView.style.removeProperty('visibility');
        signalsPageView.style.removeProperty('visibility');

        if (active === 'mood') {
            moodPageView.style.setProperty('display', 'block', 'important');
            signalsPageView.style.setProperty('display', 'none', 'important');
            moodPageView.style.setProperty('visibility', 'visible', 'important');
            signalsPageView.style.setProperty('visibility', 'hidden', 'important');

            moodBtn && moodBtn.classList.add('active');
            signalsBtn && signalsBtn.classList.remove('active');
            
            // Update header title
        const headerTitle = document.getElementById('headerTitle');
        if (headerTitle) {
            headerTitle.textContent = 'NSE Market Mood';
        }
        } else if (active === 'signals') {
            moodPageView.style.setProperty('display', 'none', 'important');
            signalsPageView.style.setProperty('display', 'block', 'important');
            moodPageView.style.setProperty('visibility', 'hidden', 'important');
            signalsPageView.style.setProperty('visibility', 'visible', 'important');
            signalsPageView.style.setProperty('background', '#ffffff', 'important');

            signalsBtn && signalsBtn.classList.add('active');
            moodBtn && moodBtn.classList.remove('active');
            
            // Update header title
        const headerTitle = document.getElementById('headerTitle');
        if (headerTitle) {
            headerTitle.textContent = 'NSE Signals';
            }
        }

        console.log('setActiveView result', {
            active,
            moodDisplay: moodPageView.style.display,
            signalsDisplay: signalsPageView.style.display,
            moodParent: moodPageView.parentElement?.id,
            signalsParent: signalsPageView.parentElement?.id,
        });
    }

    showMoodView() {
        console.log('showMoodView: switching to mood');
        
        // Prevent multiple rapid calls
        if (this._switchingView) {
            console.log('View switch already in progress, ignoring');
            return;
        }
        
        if (this.currentView === 'mood') {
            console.log('Already on Mood view');
            return;
        }
        
        this._switchingView = true;
        
        try {
            // Update state first
            this.currentView = 'mood';
            
            // Use centralized view switching
            this.setActiveView('mood');
            
            // Restart polling if market is open
            if (this.isMarketOpen()) {
                this.startPolling();
            }
            
            // Show mood page elements
            const moodPageView = document.getElementById('moodPageView');
            if (moodPageView) {
                const moodGreetingArea = moodPageView.querySelector('.mood-greeting-area');
                const moodCard = moodPageView.querySelector('#moodCard');
                const mainIndicesGrid = moodPageView.querySelector('#mainIndicesGrid');
            const allIndicesSection = this.moodPageView.querySelector('#allIndicesSection');
            const advanceDecline = this.moodPageView.querySelector('.advance-decline');
            const dataSourceInfo = this.moodPageView.querySelector('.data-source-info');
            
            if (moodGreetingArea) {
                moodGreetingArea.style.setProperty('display', 'flex', 'important');
                moodGreetingArea.style.setProperty('visibility', 'visible', 'important');
            }
            
            if (moodCard) {
                moodCard.style.setProperty('opacity', '1', 'important');
                moodCard.style.setProperty('display', 'block', 'important');
                moodCard.style.setProperty('visibility', 'visible', 'important');
            }
            
            if (mainIndicesGrid) {
                mainIndicesGrid.style.setProperty('display', 'grid', 'important');
                mainIndicesGrid.style.setProperty('visibility', 'visible', 'important');
            }
            
            if (allIndicesSection) {
                allIndicesSection.style.setProperty('display', 'block', 'important');
                allIndicesSection.style.setProperty('visibility', 'visible', 'important');
            }
            
            if (advanceDecline) {
                advanceDecline.style.setProperty('display', 'block', 'important');
                advanceDecline.style.setProperty('visibility', 'visible', 'important');
            }
            
            if (dataSourceInfo) {
                dataSourceInfo.style.setProperty('display', 'block', 'important');
                dataSourceInfo.style.setProperty('visibility', 'visible', 'important');
            }
            } // Close if (moodPageView) block
            
            // Load/refresh data
            requestAnimationFrame(() => {
                if (this.lastMarketData) {
                    this.updateUI(this.lastMarketData);
                    if (this.chartsEnabled) {
                        this.loadIndexHistory().catch(err => 
                            console.warn('Index history loading failed:', err)
                        );
                    }
                    if (this.lastMarketStatus && this.lastMarketStatus.isOpen) {
                        this.startPolling();
                    }
                } else {
                    this.loadData().then(() => {
                        if (this.lastMarketStatus && this.lastMarketStatus.isOpen) {
                            this.startPolling();
                        }
                    }).catch(err => {
                        console.error('Error loading data:', err);
                    });
                }
                
                // Scroll to top after a brief delay
                setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
                    this._switchingView = false;
                }, 100);
            });
            
        } catch (error) {
            console.error('Error in showMoodView:', error);
            this._switchingView = false;
        }
    }

    showSignalsView() {
        // Prevent multiple rapid calls
        if (this._switchingView) {
            console.log('View switch already in progress, ignoring');
            return;
        }
        
        if (this.currentView === 'signals') {
            console.log('Already on Signals view');
            return;
        }
        
        this._switchingView = true;
        console.log('Switching to Signals view');
        
        try {
            // Get DOM elements - force fresh lookup to ensure we have the latest references
            const moodPageView = document.getElementById('moodPageView');
            const signalsPageView = document.getElementById('signalsPageView');
            
            // Update instance references
            this.moodPageView = moodPageView;
            this.signalsPageView = signalsPageView;
            
            // Validate elements exist
            if (!signalsPageView) {
                console.error('signalsPageView element not found');
                this._switchingView = false;
                return;
            }
            
            if (!moodPageView) {
                console.error('moodPageView element not found');
                this._switchingView = false;
                return;
            }
            
            // Update state first
            this.currentView = 'signals';
            
            // Stop polling when switching to Signals page
            this.stopPolling();
            
            // Update header title
            const headerTitle = document.getElementById('headerTitle');
            if (headerTitle) {
                headerTitle.textContent = 'NSE Signals';
            }
            
            // CRITICAL: Force hide mood page and show signals page with !important
            // This overrides any existing inline styles or CSS rules
            moodPageView.style.setProperty('display', 'none', 'important');
            moodPageView.style.setProperty('visibility', 'hidden', 'important');
            moodPageView.classList.add('hidden');
            
            signalsPageView.style.setProperty('display', 'block', 'important');
            signalsPageView.style.setProperty('visibility', 'visible', 'important');
            signalsPageView.style.setProperty('background', '#ffffff', 'important');
            signalsPageView.classList.remove('hidden');
        
            // Force reflow
        void this.signalsPageView.offsetHeight;
            
            // Scroll to top immediately (before any async operations)
        window.scrollTo({ top: 0, behavior: 'instant' });
        
            // Ensure all Signals page sections are visible and properly styled
            const signalsStatusPanel = document.getElementById('signalsStatusPanel');
        const signalsSection = document.getElementById('signalsSection');
            const signalsContainer = document.getElementById('signalsContainer');
            const signalsLoading = document.getElementById('signalsLoading');
            const dataAvailabilitySection = document.getElementById('dataAvailabilitySection');
            
            // Show and style the status panel
            if (signalsStatusPanel) {
                signalsStatusPanel.style.display = 'block';
                signalsStatusPanel.style.padding = '20px 10px 0 10px';
            }
            
            // Show and style the signals section
        if (signalsSection) {
            signalsSection.style.display = 'block';
                signalsSection.style.padding = '20px 10px';
                signalsSection.style.minHeight = '200px';
            }
            
            // Show the container (will be populated by loadSignals)
            if (signalsContainer) {
                signalsContainer.style.display = 'block';
                signalsContainer.style.padding = '20px 10px';
            }
            
            // Show loading initially
            if (signalsLoading) {
                signalsLoading.style.display = 'block';
            }
            
            // Show data availability section (will be populated by loadDataAvailability)
            if (dataAvailabilitySection) {
                dataAvailabilitySection.style.display = 'block';
                dataAvailabilitySection.style.padding = '20px 10px';
            }
            
            // Show initial status panel
            this.updateSignalsStatus({
                date: new Date().toISOString().split('T')[0],
                signalsInfo: null,
                dataAvailability: null,
                strategy: null
            });
            
            // Load signals data asynchronously to prevent iPhone freeze
            requestAnimationFrame(() => {
                // Use requestIdleCallback if available for better performance on iPhone
                const loadData = () => {
                    try {
                        this.loadSignals();
                        this.loadDataAvailability();
                    } catch (error) {
                        console.error('Error loading signals data:', error);
                    } finally {
                        this._switchingView = false;
                    }
                };
                
                if (window.requestIdleCallback) {
                    requestIdleCallback(loadData, { timeout: 100 });
            } else {
                    setTimeout(loadData, 50);
                }
            });
            
        } catch (error) {
            console.error('Error in showSignalsView:', error);
            this._switchingView = false;
        }
    }




    async loadSignals(date = null) {
        console.log('📊 Loading signals, date:', date);
        
        // Wait a bit to ensure page view is visible
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const signalsSection = document.getElementById('signalsSection');
        const signalsContainer = document.getElementById('signalsContainer');
        const signalsLoading = document.getElementById('signalsLoading');
        const signalsError = document.getElementById('signalsError');
        const signalsEmpty = document.getElementById('signalsEmpty');

        if (!signalsSection || !signalsContainer) {
            console.error('Signals section or container not found!');
            // Retry after a short delay
            setTimeout(() => {
                const retrySection = document.getElementById('signalsSection');
                const retryContainer = document.getElementById('signalsContainer');
                if (retrySection && retryContainer) {
                    this.loadSignals(date);
                }
            }, 200);
            return;
        }

        // Show loading
        signalsLoading.style.display = 'block';
        signalsError.style.display = 'none';
        signalsEmpty.style.display = 'none';
        signalsContainer.style.display = 'none';
        signalsContainer.innerHTML = '';

        try {
            // First, analyze today's market conditions and recommend strategy
            const strategyAnalysis = this.analyzeMarketConditionsAndRecommendStrategy();
            console.log('📊 Strategy analysis:', strategyAnalysis ? 'Available' : 'Not available');
            
            // Determine the date to use - prefer today's date if we have data
            let targetDate = date;
            if (!targetDate) {
                // Use today's date if we have current market data
                const today = new Date().toISOString().split('T')[0];
                if (this.lastMarketData && this.lastMarketData.indices && this.lastMarketData.indices.length > 0) {
                    targetDate = today;
                    console.log('Using today\'s date for signals:', targetDate);
                } else {
                    // Try to get latest available date from API
                    try {
                        const latestDateResponse = await fetch('/api/get-latest-signal-date');
                        if (latestDateResponse.ok) {
                            const latestDateData = await latestDateResponse.json();
                            if (latestDateData.latest_complete_date) {
                                targetDate = latestDateData.latest_complete_date;
                            } else {
                                targetDate = today;
                            }
                        } else {
                            targetDate = today;
                    }
                } catch (e) {
                        targetDate = today;
                    }
                }
            }

            console.log('📅 Target date for signals:', targetDate);

            // Update status with target date
            this.updateSignalsStatus({ date: targetDate });

            // First, try to get existing signals for this date
            let url = '/api/get-signals';
            if (targetDate) {
                url = `/api/get-signals?date=${targetDate}`;
            }
            // Add strategy parameter
            if (this.selectedStrategy) {
                url += `${targetDate ? '&' : '?'}strategy=${this.selectedStrategy}`;
            }

            console.log('🔍 Fetching existing signals from:', url);
            let response = await fetch(url);
            let data = null;
            
            if (response.ok) {
                // Check if response is actually JSON before parsing
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    try {
                data = await response.json();
                        console.log('✅ Found existing signals:', data);
                        
                        // Update status with signals info
                        this.updateSignalsStatus({
                            signalsInfo: {
                                hasSignals: data.hasSignals || false,
                                signals: data.signals || [],
                                success: data.success !== false,
                                message: data.message
                            },
                            backendMessage: data.message,
                            mode: (data.signals && data.signals.length > 0) ? 'signals' : 'strategy-only'
                        });
                    } catch (parseError) {
                        console.warn('⚠️ Failed to parse signals response as JSON:', parseError);
                        data = null;
                    }
                            } else {
                    console.warn('⚠️ Signals response is not JSON, treating as no signals');
                    data = null;
                            }
                        } else {
                // Non-OK response - don't try to parse JSON from 404 HTML pages
                console.warn(`⚠️ Signals API returned ${response.status}, skipping JSON parse`);
                data = null;
            }
            
            // Extract signals array from data with safe defaults
            let signalsArray = [];
            let hasSignals = false;
            let signalsMessage = '';
            let signalsSuccess = true;
            
            if (data && Array.isArray(data.signals)) {
                signalsArray = data.signals;
                hasSignals = signalsArray.length > 0;
                signalsMessage = data.message || '';
                signalsSuccess = data.success !== false;
            } else if (data) {
                // Data exists but signals might be missing - log warning
                console.warn('⚠️ Unexpected response shape: data exists but signals array is missing or invalid', data);
                signalsArray = [];
                hasSignals = false;
                signalsMessage = data.message || 'No signals available';
                signalsSuccess = data.success !== false;
            }
            
            // If no data found or no signals, try to generate new ones
            if (!data || !hasSignals) {
                console.log('⚠️ No existing signals found, generating new ones...');
                try {
                    const generatedData = await this.generateSignalsForDate(targetDate);
                    
                    // Update data and signals array from generated response
                    if (generatedData) {
                        data = generatedData;
                        signalsArray = Array.isArray(generatedData.signals) ? generatedData.signals : [];
                        hasSignals = signalsArray.length > 0;
                        signalsMessage = generatedData.message || '';
                        signalsSuccess = generatedData.success !== false;
                        
                        // Update status with generated signals info
                        this.updateSignalsStatus({
                            signalsInfo: {
                                hasSignals: hasSignals,
                                signals: signalsArray,
                                success: signalsSuccess,
                                message: signalsMessage
                            },
                            backendMessage: signalsMessage,
                            mode: hasSignals ? 'signals' : 'strategy-only'
                        });
                    }
                } catch (genError) {
                    // If generation also fails, show strategy recommendation only
                    console.warn('⚠️ Signal generation failed, showing strategy recommendation only:', genError.message);
                    data = null; // Set to null to trigger strategy-only display
                    signalsArray = [];
                    hasSignals = false;
                    signalsMessage = genError.message || 'Signal generation failed';
                    signalsSuccess = false;
                    
                    // Update status to show unavailable
                    this.updateSignalsStatus({
                        signalsInfo: {
                            hasSignals: false,
                            signals: [],
                            success: false,
                            message: signalsMessage
                        },
                        backendMessage: signalsMessage,
                        mode: 'strategy-only'
                    });
                }
            }

            signalsLoading.style.display = 'none';

            // Update status with strategy
            if (strategyAnalysis) {
                this.updateSignalsStatus({ 
                    strategy: strategyAnalysis,
                    mode: hasSignals ? 'signals' : 'strategy-only'
                });
            }

            // Handle response - show strategy recommendation even if no signals or API failed
            if (!hasSignals) {
                // Always show strategy recommendation if we have market data
                if (strategyAnalysis) {
                    console.log('✅ Rendering strategy recommendation (no signals available)');
                    
                    // Update status with strategy and no signals info
                    this.updateSignalsStatus({
                        signalsInfo: {
                            hasSignals: false,
                            signals: signalsArray,
                            success: signalsSuccess,
                            message: signalsMessage || 'No signals available'
                        },
                        strategy: strategyAnalysis,
                        backendMessage: signalsMessage || 'No signals available for this date',
                        mode: 'strategy-only'
                    });
                    
                    signalsContainer.innerHTML = ''; // Clear any previous content
                    this.renderStrategyRecommendation(strategyAnalysis, signalsContainer);
                    signalsContainer.style.setProperty('display', 'block', 'important');
                    signalsEmpty.style.display = 'none';
            signalsLoading.style.display = 'none';
                    console.log('✅ Strategy recommendation rendered, container visible');
                    this._switchingView = false;
                    return;
                } else {
                    console.warn('⚠️ No strategy analysis available, showing empty state');
                    
                    // Update status even without strategy
                    this.updateSignalsStatus({
                        signalsInfo: {
                            hasSignals: false,
                            signals: signalsArray,
                            success: signalsSuccess,
                            message: signalsMessage || 'No signals available'
                        },
                        backendMessage: signalsMessage || 'No signals available for this date',
                        mode: 'strategy-only'
                    });
                }
                
                // Show empty state
                signalsEmpty.style.display = 'block';
                signalsContainer.style.display = 'none';
                
                const emptyTitle = signalsEmpty.querySelector('div[style*="font-size: 1.2rem"]');
                const emptyMessage = signalsEmpty.querySelector('div[style*="font-size: 0.95rem"]');
                
                if (emptyTitle) {
                    emptyTitle.textContent = 'No Potential Signals';
                }
                if (emptyMessage) {
                    const message = data?.message || 
                        `No trading signals were found for ${targetDate}.<br>This could mean the market conditions don't meet the signal criteria.`;
                    emptyMessage.innerHTML = message;
                }
                
                // Setup generate button
                const generateBtnEmpty = document.getElementById('generateSignalsBtnEmpty');
                if (generateBtnEmpty) {
                    generateBtnEmpty.onclick = () => this.generateSignals();
                }
                return;
            }
            
            // Display strategy recommendation first, then signals
            signalsEmpty.style.display = 'none';
            signalsContainer.style.setProperty('display', 'block', 'important');
            signalsContainer.innerHTML = '';
            
            // Update strategy analysis with actual stock recommendations from signals
            if (strategyAnalysis && hasSignals && signalsArray.length > 0) {
                // Extract top stocks from signals
                const topStocks = signalsArray
                    .slice(0, 5) // Top 5 stocks
                    .map(signal => ({
                        symbol: signal.symbol,
                        score: signal.score,
                        entryPrice: signal.entry_price,
                        targetPrice: signal.target_price
                    }));
                strategyAnalysis.recommendedStocks = topStocks;
            }
            
            // Update status with final signals info
            this.updateSignalsStatus({
                signalsInfo: {
                    hasSignals: hasSignals,
                    signals: signalsArray,
                    success: signalsSuccess,
                    message: signalsMessage || `Found ${signalsArray.length} signals`
                },
                strategy: strategyAnalysis || null,
                backendMessage: signalsMessage,
                mode: 'signals'
            });

            // Render strategy recommendation
            if (strategyAnalysis) {
                this.renderStrategyRecommendation(strategyAnalysis, signalsContainer);
            }

            // Display signals
            console.log('📈 Rendering', signalsArray.length, 'signals');
            const runId = data?.run_id || data?.runId || null;
            const signalDate = data?.date || targetDate;
            this.renderSignals(signalsArray, runId, signalDate, signalsContainer);
            
        } catch (error) {
            console.error('❌ Error loading signals:', error);
            signalsLoading.style.display = 'none';
            signalsError.style.display = 'block';
            signalsContainer.style.display = 'none';
            signalsEmpty.style.display = 'none';
            
            // Update status to show error
            this.updateSignalsStatus({
                signalsInfo: {
                    hasSignals: false,
                    signals: [],
                    success: false,
                    message: 'Error loading signals'
                }
            });
            
            let errorMessage = error.message || 'Failed to load signals. Please try again.';
            if (error.message && error.message.includes('fetch')) {
                errorMessage = 'Network error: Could not connect to the server. Please check your connection and try again.';
            }
            signalsError.textContent = errorMessage;
        }
    }

    async generateSignalsForDate(date) {
        console.log('🔄 Generating signals for date:', date);
        
            let generateUrl = '/api/generate-signals';
            if (date) {
                generateUrl = `/api/generate-signals?date=${date}`;
            }
            // Add strategy parameter
            if (this.selectedStrategy) {
                generateUrl += `${date ? '&' : '?'}strategy=${this.selectedStrategy}`;
            }
        
        // Try generate-signals first, fallback to test-generate-signals
        let response = await fetch(generateUrl);
        if (!response.ok) {
            console.log('⚠️ generate-signals failed, trying test-generate-signals...');
            response = await fetch('/api/test-generate-signals');
        }
        
        if (!response.ok) {
            // Don't throw - return null to allow graceful fallback
            console.warn(`⚠️ Signal generation API returned ${response.status}, returning null`);
            return null;
        }
        
        // Check if response is actually JSON before parsing
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                const data = await response.json();
                console.log('✅ Generated signals:', data);
                return data;
            } catch (parseError) {
                console.warn('⚠️ Failed to parse generate signals response as JSON:', parseError);
                return null;
            }
        } else {
            console.warn('⚠️ Generate signals response is not JSON, returning null');
            return null;
        }
    }

    analyzeMarketConditionsAndRecommendStrategy() {
        // Analyze today's market conditions based on available data
        if (!this.lastMarketData) {
            console.log('No market data available for analysis');
            return null;
        }

        const { indices, vix, mood, advanceDecline } = this.lastMarketData;
        
        if (!indices || indices.length === 0) {
            console.log('No indices data available for analysis');
            return null;
        }

        // Get key indices
        const nifty50 = indices.find(idx => idx.symbol && idx.symbol.toUpperCase().includes('NIFTY 50'));
        const niftyBank = indices.find(idx => idx.symbol && idx.symbol.toUpperCase().includes('NIFTY BANK'));
        const niftyIT = indices.find(idx => idx.symbol && idx.symbol.toUpperCase().includes('NIFTY IT'));
        const vixValue = vix?.last || (indices.find(idx => idx.symbol && idx.symbol.toUpperCase().includes('VIX'))?.last);

        // Calculate market metrics
        const moodScore = mood?.score || 50;
        const niftyChange = nifty50?.pChange || 0;
        const bankChange = niftyBank?.pChange || 0;
        const advances = advanceDecline?.advances || 0;
        const declines = advanceDecline?.declines || 0;
        const advanceDeclineRatio = advances > 0 && declines > 0 ? advances / declines : 1;

        // Analyze conditions
        const isBullish = moodScore >= 60;
        const isBearish = moodScore <= 40;
        const isNeutral = moodScore >= 40 && moodScore < 60;
        const isVolatile = vixValue && vixValue > 18;
        const isLowVolatility = vixValue && vixValue < 12;
        const strongBreadth = advanceDeclineRatio > 1.5;
        const weakBreadth = advanceDeclineRatio < 0.67;
        const positiveMomentum = niftyChange > 0.5 && bankChange > 0.5;
        const negativeMomentum = niftyChange < -0.5 && bankChange < -0.5;

        // Determine strategy
        let strategy = 'Momentum Gap';
        let strategyDescription = 'Look for stocks with positive gaps and strong momentum.';
        let reasoning = [];

        if (isBullish && positiveMomentum && strongBreadth && !isVolatile) {
            // Strong bullish conditions - Momentum Gap strategy
            strategy = 'Momentum Gap';
            strategyDescription = 'Market is showing strong bullish momentum with broad participation. Focus on stocks with positive gaps and strong relative strength.';
            reasoning = [
                `Market mood: ${moodScore}/100 (Bullish)`,
                `NIFTY 50: ${niftyChange > 0 ? '+' : ''}${niftyChange.toFixed(2)}%`,
                `Market breadth: ${advances} advances vs ${declines} declines`,
                `Volatility: ${vixValue ? vixValue.toFixed(2) : 'N/A'} (${isVolatile ? 'High' : 'Normal'})`
            ];
        } else if (isBullish && isVolatile) {
            // Bullish but volatile - Breakout strategy
            strategy = 'Breakout';
            strategyDescription = 'Market is bullish but volatile. Look for stocks breaking out of consolidation patterns with high volume.';
            reasoning = [
                `Market mood: ${moodScore}/100 (Bullish)`,
                `High volatility: VIX at ${vixValue?.toFixed(2) || 'N/A'}`,
                `Focus on breakouts with volume confirmation`
            ];
        } else if (isNeutral && isLowVolatility) {
            // Neutral, low volatility - Mean Reversion
            strategy = 'Mean Reversion';
            strategyDescription = 'Market is neutral with low volatility. Look for oversold stocks that may revert to mean.';
            reasoning = [
                `Market mood: ${moodScore}/100 (Neutral)`,
                `Low volatility: VIX at ${vixValue?.toFixed(2) || 'N/A'}`,
                `Suitable for mean reversion trades`
            ];
        } else if (isBearish && negativeMomentum) {
            // Bearish conditions - Short or Wait
            strategy = 'Defensive / Wait';
            strategyDescription = 'Market is showing bearish pressure. Consider defensive positions or wait for better entry points.';
            reasoning = [
                `Market mood: ${moodScore}/100 (Bearish)`,
                `NIFTY 50: ${niftyChange.toFixed(2)}%`,
                `Weak market breadth: ${advances} advances vs ${declines} declines`,
                `Consider defensive strategies or wait for reversal signals`
            ];
        } else if (isVolatile && (isBullish || isNeutral)) {
            // High volatility - Volatility Play
            strategy = 'Volatility Play';
            strategyDescription = 'High volatility environment. Look for stocks with strong momentum that can benefit from volatility.';
            reasoning = [
                `Market mood: ${moodScore}/100`,
                `High volatility: VIX at ${vixValue?.toFixed(2) || 'N/A'}`,
                `Focus on high-beta stocks with strong momentum`
            ];
        }

        return {
            strategy,
            strategyDescription,
            reasoning,
            recommendedStocks: [], // Will be populated from signals
            marketConditions: {
                moodScore,
                niftyChange,
                bankChange,
                vix: vixValue,
                advanceDeclineRatio,
                advances,
                declines
            }
        };
    }

    renderStrategyRecommendation(analysis, container) {
        if (!analysis || !container) {
            console.warn('⚠️ Cannot render strategy recommendation:', { analysis: !!analysis, container: !!container });
            return;
        }
        console.log('📊 Rendering strategy recommendation:', analysis.strategy);

        const strategyCard = document.createElement('div');
        strategyCard.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 20px;
            color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;

        strategyCard.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                <div style="font-size: 2rem;">📊</div>
                <div>
                    <div style="font-size: 0.9rem; opacity: 0.9; margin-bottom: 4px;">Recommended Strategy for Tomorrow</div>
                    <div style="font-size: 1.4rem; font-weight: 700;">${analysis.strategy}</div>
                </div>
            </div>
            <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 15px; margin-bottom: 15px; backdrop-filter: blur(10px);">
                <div style="font-size: 0.95rem; line-height: 1.6; opacity: 0.95;">
                    ${analysis.strategyDescription}
                </div>
            </div>
            <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 10px; opacity: 0.9;">Market Analysis:</div>
                <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; line-height: 1.8; opacity: 0.9;">
                    ${analysis.reasoning.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
            ${analysis.recommendedStocks && analysis.recommendedStocks.length > 0 ? `
                <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 15px;">
                    <div style="font-size: 0.85rem; font-weight: 600; margin-bottom: 10px; opacity: 0.9;">Top Recommended Stocks:</div>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                        ${analysis.recommendedStocks.map((stock, idx) => `
                            <div style="background: rgba(255,255,255,0.15); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">${idx + 1}. ${typeof stock === 'string' ? stock : stock.symbol}</div>
                                    ${typeof stock === 'object' && stock.score ? `
                                        <div style="font-size: 0.8rem; opacity: 0.85;">
                                            Score: <strong>${stock.score}/100</strong>
                                            ${stock.entryPrice ? ` • Entry: ₹${stock.entryPrice.toFixed(2)}` : ''}
                                            ${stock.targetPrice ? ` • Target: ₹${stock.targetPrice.toFixed(2)}` : ''}
                                        </div>
                                    ` : ''}
                                </div>
                                ${typeof stock === 'object' && stock.score ? `
                                    <div style="background: rgba(255,255,255,0.25); padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;">
                                        ${stock.score}/100
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : `
                <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 15px; text-align: center; font-size: 0.85rem; opacity: 0.9;">
                    Stock recommendations will be generated based on the selected strategy.
                </div>
            `}
        `;

        container.appendChild(strategyCard);
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

            signalsLoading.style.display = 'none';

            if (!response.ok) {
                // Non-OK response - don't try to parse JSON from 404 HTML pages
                console.warn(`⚠️ Generate signals API returned ${response.status}`);
                signalsError.style.display = 'block';
                signalsError.textContent = 'Signal generation is not available yet.';
                return;
            }

            // Check if response is actually JSON before parsing
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn('⚠️ Generate signals response is not JSON');
                signalsError.style.display = 'block';
                signalsError.textContent = 'Signal generation is not available yet.';
                return;
            }

            let data;
            try {
                data = await response.json();
                console.log('Generate signals response:', data);
            } catch (parseError) {
                console.warn('⚠️ Failed to parse generate signals response as JSON:', parseError);
                signalsError.style.display = 'block';
                signalsError.textContent = 'Failed to parse signal generation response.';
                return;
            }

            if (data.message || data.error) {
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

        // Create header info (only if not appending to existing content)
        if (!container) {
        const headerInfo = document.createElement('div');
        headerInfo.style.cssText = 'padding: 15px; background: #f3f4f6; border-radius: 8px; margin-bottom: 15px; font-size: 0.9rem;';
        headerInfo.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                        <strong>Run ID:</strong> <span style="font-family: monospace; font-size: 0.85rem;">${runId || 'N/A'}</span>
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
        } else {
            // Add a separator if appending
            const separator = document.createElement('div');
            separator.style.cssText = 'margin: 20px 0; border-top: 2px solid #e5e7eb;';
            signalsContainer.appendChild(separator);
            
            const headerInfo = document.createElement('div');
            headerInfo.style.cssText = 'padding: 15px; background: #f3f4f6; border-radius: 8px; margin-bottom: 15px; font-size: 0.9rem;';
            headerInfo.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <strong>Run ID:</strong> <span style="font-family: monospace; font-size: 0.85rem;">${runId || 'N/A'}</span>
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
        }

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
                        console.warn('get-latest-signal-date API not available, using today\'s date');
                        // Use today's date as fallback
                        date = new Date().toISOString().split('T')[0];
                    } else {
                        // Check if response is actually JSON before parsing
                        const contentType = latestDateResponse.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            try {
                        const latestDateData = await latestDateResponse.json();
                        if (latestDateData.latest_complete_date) {
                            date = latestDateData.latest_complete_date;
                        } else if (latestDateData.dates) {
                            // Use the latest available date
                            const dates = [latestDateData.dates.bhavcopy, latestDateData.dates.indices]
                                .filter(Boolean)
                                .sort()
                                .reverse();
                                    date = dates[0] || new Date().toISOString().split('T')[0];
                        } else {
                                    date = new Date().toISOString().split('T')[0];
                                }
                            } catch (parseError) {
                                console.warn('Failed to parse latest signal date response:', parseError);
                                date = new Date().toISOString().split('T')[0];
                            }
                        } else {
                            console.warn('Latest signal date response is not JSON, using today');
                            date = new Date().toISOString().split('T')[0];
                        }
                    }
                } catch (error) {
                    console.warn('Error fetching latest signal date, using today:', error);
                    date = new Date().toISOString().split('T')[0];
                }
            }

            // Fetch data availability
            const response = await fetch(`/api/check-date-data?date=${date}`);

            dataAvailabilityLoading.style.display = 'none';

            if (!response.ok) {
                // Non-OK response - don't try to parse JSON from 404 HTML pages
                console.warn(`⚠️ Data availability API returned ${response.status}, showing error message`);
                dataAvailabilityError.style.display = 'block';
                dataAvailabilityError.textContent = 'Data availability check is not available yet.';
                
                // Update status with unavailable data
                this.updateSignalsStatus({
                    dataAvailability: {
                        data: {
                            indices: { available: false, count: 0 },
                            bhavcopy: { available: false, count: 0 },
                            premarket: { available: false, count: 0 }
                        }
                    }
                });
                return;
            }

            // Check if response is actually JSON before parsing
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    const data = await response.json();
                    if (!data.success) {
                        throw new Error(data.error || data.message || 'Failed to load data availability');
                    }
            // Render data availability
            this.renderDataAvailability(data);
                    
                    // Update signals status with data availability
                    this.updateSignalsStatus({ dataAvailability: data });
                } catch (parseError) {
                    console.warn('⚠️ Failed to parse data availability response as JSON:', parseError);
                    dataAvailabilityError.style.display = 'block';
                    dataAvailabilityError.textContent = 'Failed to parse data availability response.';
                }
            } else {
                console.warn('⚠️ Data availability response is not JSON');
                dataAvailabilityError.style.display = 'block';
                dataAvailabilityError.textContent = 'Data availability check is not available yet.';
            }
        } catch (error) {
            console.error('Error loading data availability:', error);
            dataAvailabilityLoading.style.display = 'none';
            dataAvailabilityError.style.display = 'block';
            dataAvailabilityError.textContent = error.message || 'Failed to load data availability';
            
            // Update status with error state
            this.updateSignalsStatus({
                dataAvailability: {
                    data: {
                        indices: { available: false, count: 0 },
                        bhavcopy: { available: false, count: 0 },
                        premarket: { available: false, count: 0 }
                    }
                }
            });
        }
    }

    updateSignalsStatus({ date, signalsInfo, dataAvailability, strategy, backendMessage, mode }) {
        const statusPanel = document.getElementById('signalsStatusPanel');
        if (!statusPanel) {
            console.warn('Signals status panel not found');
            return;
        }

        // Update stored data
        if (date !== undefined) this._signalsStatusData.date = date;
        if (signalsInfo !== undefined) this._signalsStatusData.signalsInfo = signalsInfo;
        if (dataAvailability !== undefined) this._signalsStatusData.dataAvailability = dataAvailability;
        if (strategy !== undefined) this._signalsStatusData.strategy = strategy;
        if (backendMessage !== undefined) this._signalsStatusData.backendMessage = backendMessage;
        if (mode !== undefined) this._signalsStatusData.mode = mode;

        // Use stored data with fallbacks
        const targetDate = this._signalsStatusData.date || date || new Date().toISOString().split('T')[0];
        const signals = this._signalsStatusData.signalsInfo || signalsInfo;
        const dataAvail = this._signalsStatusData.dataAvailability || dataAvailability;
        const strategyInfo = this._signalsStatusData.strategy || strategy;
        const message = this._signalsStatusData.backendMessage || backendMessage || signals?.message || '';
        const currentMode = this._signalsStatusData.mode || mode || 'unknown';

        // Determine signals engine status with detailed messages
        let engineStatus = 'Temporarily unavailable — showing strategy only.';
        let engineStatusColor = '#ef4444';
        
        if (signals) {
            const signalCount = signals.signals ? signals.signals.length : 0;
            const hasSignals = signals.hasSignals === true && signalCount > 0;
            const success = signals.success !== false && signals.success !== undefined;
            
            if (hasSignals) {
                // Active with signals
                engineStatus = `Active — ${signalCount} signal${signalCount !== 1 ? 's' : ''} generated.`;
                engineStatusColor = '#10b981';
            } else if (success || (signals.success === undefined && message)) {
                // Request succeeded but no signals - use backend message
                if (message) {
                    // Clean up the message for display
                    let cleanMessage = message;
                    // Remove redundant prefixes
                    if (cleanMessage.includes('No signals available')) {
                        cleanMessage = cleanMessage.replace('No signals available for this date yet. ', '');
                    }
                    // Show the reason from backend
                    engineStatus = `No signals — ${cleanMessage}`;
                    engineStatusColor = '#f59e0b';
                } else {
                    engineStatus = 'Connected — no signals generated yet for this date.';
                    engineStatusColor = '#f59e0b';
                }
            } else if (signals.success === false) {
                // Generation failed
                if (message) {
                    engineStatus = `Temporarily unavailable — ${message}`;
                } else {
                    engineStatus = 'Temporarily unavailable — showing strategy only.';
                }
                engineStatusColor = '#ef4444';
            }
        } else if (message) {
            // No signals object but we have a message
            engineStatus = `No signals — ${message}`;
            engineStatusColor = '#f59e0b';
        }

        // Get strategy name with mode indicator
        let strategyText = 'Strategy: Not available';
        if (strategyInfo) {
            let strategyName = '';
            if (typeof strategyInfo === 'string') {
                strategyName = strategyInfo;
            } else if (strategyInfo.strategy) {
                strategyName = strategyInfo.strategy;
            }
            
            if (strategyName) {
                // Determine if we're in strategy-only mode (no signals)
                const signalCount = signals?.signals ? signals.signals.length : 0;
                const hasSignals = signals?.hasSignals === true && signalCount > 0;
                
                if (!hasSignals && signalCount === 0) {
                    strategyText = `Strategy: ${strategyName} (strategy-only mode, no entry list)`;
                } else {
                    strategyText = `Strategy: ${strategyName}`;
                }
            }
        }

        // Render status panel
        statusPanel.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="font-size: 0.85rem; font-weight: 600; color: #667eea; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Signals Status</div>
                <div style="display: grid; grid-template-columns: 1fr; gap: 12px; font-size: 0.9rem;">
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <span style="color: #666; min-width: 60px; font-weight: 500;">Date:</span>
                        <span style="color: #333; font-weight: 500;">${targetDate}</span>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <span style="color: #666; min-width: 60px; font-weight: 500;">Engine:</span>
                        <span style="color: ${engineStatusColor}; font-weight: 500; flex: 1; line-height: 1.4;">${engineStatus}</span>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <span style="color: #666; min-width: 60px; font-weight: 500;">${strategyText}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Show the panel
        statusPanel.style.display = 'block';
    }

    renderDataAvailability(data) {
        const dataAvailabilityContent = document.getElementById('dataAvailabilityContent');
        if (!dataAvailabilityContent) return;

        // Defensive check: ensure data and dataInfo exist
        if (!data || typeof data !== 'object') {
            console.warn('⚠️ renderDataAvailability: Invalid data object', data);
            dataAvailabilityContent.innerHTML = `
                <div style="background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 20px; text-align: center; color: #666;">
                    <div style="font-size: 0.95rem;">No data availability information available.</div>
                </div>
            `;
            return;
        }

        const { data: dataInfo, date, canGenerateSignals } = data;

        // Defensive check: ensure dataInfo exists and is an object
        if (!dataInfo || typeof dataInfo !== 'object') {
            console.warn('⚠️ renderDataAvailability: dataInfo is missing or invalid', dataInfo);
            dataAvailabilityContent.innerHTML = `
                <div style="background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 20px; text-align: center; color: #666;">
                    <div style="font-size: 0.95rem;">No data availability information available.</div>
                </div>
            `;
            return;
        }

        // Default missing fields to safe values before accessing properties
        const bhavcopy = dataInfo.bhavcopy || { available: false, count: 0 };
        const indices = dataInfo.indices || { available: false, count: 0 };
        const premarket = dataInfo.premarket || { available: false, count: 0 };
        const signals = dataInfo.signals || { available: false, count: 0 };
        const signalRuns = dataInfo.signalRuns || { count: 0, runs: [] };

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
                    <div style="padding: 12px; background: ${bhavcopy.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${bhavcopy.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Bhavcopy</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${bhavcopy.count || 0} stocks
                        </div>
                    </div>

                    <div style="padding: 12px; background: ${indices.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${indices.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Indices</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${indices.count || 0} indices
                        </div>
                    </div>

                    <div style="padding: 12px; background: ${premarket.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${premarket.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Pre-market</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${premarket.count || 0} items
                        </div>
                    </div>

                    <div style="padding: 12px; background: ${signals.available ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="font-size: 1.2rem;">${signals.available ? '✅' : '❌'}</span>
                            <span style="font-weight: 600; color: #333;">Signals</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666;">
                            ${signals.count || 0} signals
                        </div>
                    </div>
                </div>

                ${signalRuns.count > 0 && signalRuns.runs && signalRuns.runs.length > 0 ? `
                    <div style="padding: 12px; background: #f3f4f6; border-radius: 8px; margin-top: 10px;">
                        <div style="font-weight: 600; color: #333; margin-bottom: 8px;">Signal Runs (${signalRuns.count})</div>
                        ${signalRuns.runs.map((run, idx) => `
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: ${idx < signalRuns.runs.length - 1 ? '5px' : '0'};">
                                Run ${idx + 1}: ${run.run_id || 'N/A'} • ${run.regime_code || 'N/A'} • ${run.strategies_used?.join(', ') || 'N/A'}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    updateDataSourceDisplay(source, data = null) {
        // Only update data source display on Mood page
        if (this.currentView !== 'mood') {
            return;
        }
        
        const dataSource = document.getElementById('dataSource');
        const updateInfo = document.getElementById('updateInfo');

        console.log('updateDataSourceDisplay called:', { source, data: !!data });

        if (source === 'uploaded' || source === 'database') {
            // Show uploaded data info
            if (dataSource) {
                dataSource.textContent = 'Uploaded Data';
            }
            if (updateInfo) {
                const fileName = data?.fileName || 'CSV File';
                const date = data?.date || 'Unknown date';
                updateInfo.textContent = `${fileName} • ${date}`;
            }
            console.log('✓ Updated to Uploaded Data display');
        } else if (source === 'api') {
            // Show NSE India info
            if (dataSource) {
                dataSource.textContent = 'NSE India';
            }
            if (updateInfo) {
                updateInfo.textContent = 'Updates every 30 sec. during market hrs.';
            }
            console.log('✓ Updated to NSE India display');
        }
    }

    openDownloadCsvsModal() {
        // Close menu modal first
        if (this.menuModal) {
            this.menuModal.classList.remove('show');
        }
        
        // Open download CSVs modal
        if (this.downloadCsvsModal) {
            this.downloadCsvsModal.classList.add('show');
            this.lockBodyScroll();
            
            // Load saved Google Sheets config
            const savedSheetId = localStorage.getItem('googleSheetId');
            const savedSheetName = localStorage.getItem('googleSheetName');
            const savedApiKey = localStorage.getItem('googleApiKey');
            
            if (savedSheetId) document.getElementById('googleSheetId').value = savedSheetId;
            if (savedSheetName) document.getElementById('googleSheetName').value = savedSheetName;
            if (savedApiKey) document.getElementById('googleApiKey').value = savedApiKey;
        }
    }

    setupDownloadCsvsModal() {
        if (this.closeDownloadCsvs && this.downloadCsvsModal) {
            this.closeDownloadCsvs.addEventListener('click', () => {
                this.downloadCsvsModal.classList.remove('show');
                this.unlockBodyScroll();
            });
        }

        // Close on backdrop click
        if (this.downloadCsvsModal) {
            this.downloadCsvsModal.addEventListener('click', (e) => {
                if (e.target === this.downloadCsvsModal) {
                    this.downloadCsvsModal.classList.remove('show');
                    this.unlockBodyScroll();
                }
            });
        }
    }

    async startDownloadCsvs() {
        // Get selected report types
        const checkboxes = document.querySelectorAll('.report-checkbox:checked');
        const reportTypes = Array.from(checkboxes).map(cb => cb.value);

        if (reportTypes.length === 0) {
            this.showDownloadStatus('Please select at least one report to download', 'error');
            return;
        }

        // Get Google Sheets config
        const googleSheetId = document.getElementById('googleSheetId').value.trim();
        const googleSheetName = document.getElementById('googleSheetName').value.trim() || 'Sheet1';
        const googleApiKey = document.getElementById('googleApiKey').value.trim();

        // Save config to localStorage
        if (googleSheetId) localStorage.setItem('googleSheetId', googleSheetId);
        if (googleSheetName) localStorage.setItem('googleSheetName', googleSheetName);
        if (googleApiKey) localStorage.setItem('googleApiKey', googleApiKey);

        // Disable start button
        if (this.startDownloadBtn) {
            this.startDownloadBtn.disabled = true;
            this.startDownloadBtn.textContent = 'Downloading...';
        }

        // Show progress section
        if (this.downloadProgressSection) {
            this.downloadProgressSection.style.display = 'block';
        }

        // Clear previous progress
        if (this.fileProgressContainer) {
            this.fileProgressContainer.innerHTML = '';
        }

        // Create progress bars for each file
        const fileProgress = {};
        const reportNames = {
            'bhavcopy': 'Full Bhavcopy',
            'marketactivity': 'Market Activity Report',
            '52w': '52 Week High/Low Report'
        };

        reportTypes.forEach(reportType => {
            const reportName = reportNames[reportType] || reportType;
            const progressId = `progress-${reportType}`;
            
            const progressDiv = document.createElement('div');
            progressDiv.id = progressId;
            progressDiv.style.cssText = 'padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;';
            progressDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 0.9rem; font-weight: 600; color: #333;">${reportName}</span>
                    <span id="${progressId}-percent" style="font-size: 0.85rem; font-weight: 600; color: #667eea;">0%</span>
                </div>
                <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                    <div id="${progressId}-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s ease; border-radius: 4px;"></div>
                </div>
                <div id="${progressId}-status" style="margin-top: 6px; font-size: 0.8rem; color: #666;">Initializing...</div>
            `;
            
            if (this.fileProgressContainer) {
                this.fileProgressContainer.appendChild(progressDiv);
            }

            fileProgress[reportType] = {
                element: progressDiv,
                percent: 0,
                status: 'Initializing...'
            };
        });

        // Update progress for a specific file
        const updateFileProgress = (reportType, percent, status) => {
            if (fileProgress[reportType]) {
                fileProgress[reportType].percent = percent;
                fileProgress[reportType].status = status;
                
                const progressId = `progress-${reportType}`;
                const barEl = document.getElementById(`${progressId}-bar`);
                const percentEl = document.getElementById(`${progressId}-percent`);
                const statusEl = document.getElementById(`${progressId}-status`);
                
                if (barEl) barEl.style.width = `${percent}%`;
                if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;
                if (statusEl) statusEl.textContent = status;
            }
        };

        // Update overall progress
        const updateOverallProgress = () => {
            const totalPercent = Object.values(fileProgress).reduce((sum, p) => sum + p.percent, 0) / reportTypes.length;
            const overallBar = document.getElementById('overallProgressBar');
            const overallPercent = document.getElementById('overallProgressPercentage');
            
            if (overallBar) overallBar.style.width = `${totalPercent}%`;
            if (overallPercent) overallPercent.textContent = `${Math.round(totalPercent)}%`;
        };

        try {
            // Simulate progress for each file
            for (const reportType of reportTypes) {
                updateFileProgress(reportType, 10, 'Connecting to NSE...');
                updateOverallProgress();
                await new Promise(resolve => setTimeout(resolve, 300));

                updateFileProgress(reportType, 30, 'Downloading CSV...');
                updateOverallProgress();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Make API call
            updateFileProgress(reportTypes[0], 50, 'Processing request...');
            updateOverallProgress();

            const response = await fetch('/api/download-nse-csvs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    reportTypes,
                    googleSheetId: googleSheetId || null,
                    googleSheetName: googleSheetName || 'Sheet1',
                    googleApiKey: googleApiKey || null
                })
            });

            const data = await response.json();

            // Update progress based on results
            if (data.success) {
                data.results.forEach((result, index) => {
                    const reportType = result.reportType;
                    if (result.success) {
                        updateFileProgress(reportType, 100, `✅ Downloaded (${(result.size / 1024).toFixed(2)} KB)`);
                    } else {
                        updateFileProgress(reportType, 0, `❌ Failed: ${result.error || 'Unknown error'}`);
                    }
                });

                // Check Google Sheets upload
                if (data.googleSheets) {
                    if (data.googleSheets.success) {
                        this.showDownloadStatus(`✅ Successfully downloaded ${data.downloaded} file(s) and uploaded to Google Sheets!`, 'success');
                    } else {
                        this.showDownloadStatus(`✅ Downloaded ${data.downloaded} file(s), but Google Sheets upload failed: ${data.googleSheets.error}`, 'warning');
                    }
                } else {
                    this.showDownloadStatus(`✅ Successfully downloaded ${data.downloaded} file(s)!`, 'success');
                }
            } else {
                this.showDownloadStatus(`❌ Error: ${data.error}`, 'error');
                reportTypes.forEach(reportType => {
                    updateFileProgress(reportType, 0, `❌ Failed: ${data.error}`);
                });
            }

            updateOverallProgress();
        } catch (error) {
            console.error('Error downloading CSVs:', error);
            this.showDownloadStatus(`❌ Error: ${error.message}`, 'error');
            reportTypes.forEach(reportType => {
                updateFileProgress(reportType, 0, `❌ Error: ${error.message}`);
            });
        } finally {
            // Re-enable start button
            if (this.startDownloadBtn) {
                this.startDownloadBtn.disabled = false;
                this.startDownloadBtn.textContent = 'Start Download';
            }
        }
    }

    showDownloadStatus(message, type = 'info') {
        const statusEl = document.getElementById('downloadStatus');
        if (!statusEl) return;

        statusEl.style.display = 'block';
        statusEl.style.padding = '12px';
        statusEl.style.borderRadius = '8px';
        
        const colors = {
            success: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
            error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
            warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
            info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
        };

        const color = colors[type] || colors.info;
        statusEl.style.background = color.bg;
        statusEl.style.border = `1px solid ${color.border}`;
        statusEl.style.color = color.text;
        statusEl.textContent = message;
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
                
                // Expose helper functions globally for console access
                window.checkBhavcopyHistory = () => {
                    if (window.marketMoodApp) {
                        return window.marketMoodApp.checkBhavcopyUploadHistory();
                    } else {
                        console.error('App not initialized yet');
                        return Promise.resolve({ success: false, error: 'App not initialized' });
                    }
                };
                
                console.log('✅ MarketMoodApp initialized successfully');
                console.log('💡 Tip: Run checkBhavcopyHistory() in console to see your bhavcopy upload history');
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
