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
    showSignalsView() {
        console.log('Switching to Signals view');
        this.currentView = 'signals';
        
        if (this.moodPageView) this.moodPageView.classList.add('hidden');
        if (this.signalsPageView) this.signalsPageView.classList.remove('hidden');
        
        const headerTitle = document.getElementById('headerTitle');
        if (headerTitle) headerTitle.textContent = 'NSE Signals';
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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