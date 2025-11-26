// Settings Management
class SettingsManager {
    constructor() {
        this.storageKey = 'nseMarketMoodSettings';
        this.defaultSettings = {
            activeApi: 'nse', // Currently active API
            apis: {
                nse: {
                    name: 'NSE India',
                    type: 'nse',
                    enabled: true,
                    config: {}
                },
                dhan: {
                    name: 'Dhan API',
                    type: 'dhan',
                    enabled: false,
                    tested: false, // Track if API was successfully tested
                    testStatus: null, // 'success', 'failed', or null
                    config: {
                        clientId: '',
                        accessToken: '',
                        apiKey: '', // API Key (optional, for v2.4+)
                        apiSecret: '', // API Secret (optional, for v2.4+)
                        customEndpoint: '' // Allow custom endpoint override
                    }
                },
                uploaded: {
                    name: 'Uploaded Data',
                    type: 'uploaded',
                    enabled: false,
                    config: {}
                }
            }
        };
        this.init();
    }

    init() {
        this.loadSettings();
        // Wait for DOM to be ready before setting up event listeners
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupEventListeners();
                this.applySettings(); // Apply settings after DOM is ready
            });
        } else {
            this.setupEventListeners();
            this.applySettings(); // DOM already ready
        }
    }

    loadSettings() {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Migrate old settings format to new format
                if (parsed.apiProvider && !parsed.apis) {
                    this.settings = {
                        activeApi: parsed.apiProvider,
                        apis: {
                            nse: {
                                name: 'NSE India',
                                type: 'nse',
                                enabled: true,
                                config: {}
                            },
                            dhan: {
                                name: 'Dhan API',
                                type: 'dhan',
                                enabled: parsed.apiProvider === 'dhan',
                                config: {
                                    clientId: parsed.dhanClientId || '',
                                    accessToken: parsed.dhanAccessToken || ''
                                }
                            }
                        }
                    };
                } else {
                    this.settings = { ...this.defaultSettings, ...parsed };
                }
            } catch (e) {
                this.settings = { ...this.defaultSettings };
            }
        } else {
            this.settings = { ...this.defaultSettings };
        }
        this.applySettings();
    }

    saveSettings() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
        this.applySettings();
    }

    applySettings() {
        // Update UI only if elements exist
        if (document.getElementById('apiList')) {
            this.updateApiList();
        }
        this.updateActiveApiDisplay();
        this.updateConfigForms();
        this.updateUploadedDataSection();
    }

    getUploadedDataList() {
        // Get all uploaded data files from localStorage - try both possible keys
        let uploadedData = localStorage.getItem('uploadedIndicesData');
        if (!uploadedData) {
            // Fallback to old key name
            uploadedData = localStorage.getItem('uploadedMarketData');
        }
        
        const uploadedDataList = [];
        
        if (uploadedData) {
            try {
                const data = JSON.parse(uploadedData);
                uploadedDataList.push({
                    fileName: data.fileName || data.source || 'Uploaded CSV',
                    dataDate: data.date || data.dataDate || 'N/A',
                    indicesCount: data.indices?.length || 0,
                    data: data
                });
            } catch (e) {
                console.error('Error parsing uploaded data:', e);
            }
        }
        
        return uploadedDataList;
    }

    async addUploadCSVDataOption(container) {
        // Check if Upload CSV Data option already exists to prevent duplicates
        const existingUploadOption = container.querySelector('[data-api-type="uploaded"]');
        if (existingUploadOption) {
            console.log('Upload CSV Data option already exists, skipping duplicate');
            return;
        }
        
        const uploadedApiItem = document.createElement('div');
        uploadedApiItem.className = 'api-item';
        uploadedApiItem.setAttribute('data-api-type', 'uploaded'); // Mark to prevent duplicates
        
        const details = document.createElement('details');
        details.className = 'api-item-collapsible';
        if (this.settings.activeApi === 'uploaded') {
            details.open = true;
        }
        
        // Get available dates
        const availableDates = await this.getAvailableDates();
        
        const summary = document.createElement('summary');
        summary.className = 'api-item-header';
        summary.innerHTML = `
            <label class="api-radio">
                <input type="radio" name="activeApi" value="uploaded" ${this.settings.activeApi === 'uploaded' ? 'checked' : ''}>
                <span class="api-name">Upload CSV Data</span>
            </label>
            <span class="api-status ${availableDates.length > 0 ? 'enabled' : 'disabled'}">
                ${availableDates.length > 0 ? '✓ Available' : '✗ No Data'}
            </span>
            <svg class="api-collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;
        
        const content = document.createElement('div');
        content.className = 'api-item-content';
        
        if (availableDates.length > 0) {
            // Sort dates in descending order (newest first)
            const sortedDates = [...availableDates].sort((a, b) => {
                return new Date(b.date) - new Date(a.date);
            });
            
            content.innerHTML = `
                <p class="api-description" style="font-size: 0.85rem; color: #666; margin: 5px 0 10px 0;">📁 Select a date to load uploaded CSV data for market mood analysis</p>
                <div style="margin-top: 15px;">
                    <label style="display: block; font-weight: 600; color: #333; margin-bottom: 8px; font-size: 0.9rem;">Select Date:</label>
                    <select id="uploadedDataDateSelect" class="form-control" style="width: 100%; padding: 10px 12px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 0.9rem; background: white; cursor: pointer;">
                        <option value="">-- Select a date --</option>
                        ${sortedDates.map(dateInfo => `
                            <option value="${dateInfo.date}" ${this.settings.uploadedDataDate === dateInfo.date ? 'selected' : ''}>
                                ${dateInfo.date} (${dateInfo.count} indices)
                            </option>
                        `).join('')}
                    </select>
                    <button type="button" id="loadUploadedDataBtn" class="btn-secondary" style="margin-top: 10px; width: 100%; padding: 10px;" disabled>
                        Load Data
                    </button>
                </div>
            `;
            
            // Add event listeners after a short delay to ensure DOM is ready
            setTimeout(() => {
                const dateSelect = document.getElementById('uploadedDataDateSelect');
                const loadBtn = document.getElementById('loadUploadedDataBtn');
                
                if (dateSelect) {
                    // Enable/disable load button based on selection
                    dateSelect.addEventListener('change', (e) => {
                        if (loadBtn) {
                            loadBtn.disabled = !e.target.value;
                        }
                    });
                    
                    // If a date is already selected, enable the button
                    if (dateSelect.value) {
                        if (loadBtn) loadBtn.disabled = false;
                    }
                }
                
                if (loadBtn) {
                    loadBtn.addEventListener('click', () => {
                        const selectedDate = dateSelect?.value;
                        if (selectedDate) {
                            this.loadUploadedDataByDate(selectedDate);
                        }
                    });
                }
            }, 100);
        } else {
            content.innerHTML = `
                <p class="api-description" style="font-size: 0.85rem; color: #666; margin: 5px 0 10px 0;">📁 No uploaded CSV data available. Use the Upload button to add CSV files.</p>
            `;
        }
        
        details.appendChild(summary);
        details.appendChild(content);
        uploadedApiItem.appendChild(details);
        container.appendChild(uploadedApiItem);
    }

    async getAvailableDates() {
        const dates = [];
        
        // Get dates from database first (this is where all uploaded files are stored)
        try {
            // Try the new endpoint first
            const datesResponse = await fetch('/api/get-uploaded-dates');
            if (datesResponse.ok) {
                const dbDates = await datesResponse.json();
                if (dbDates && Array.isArray(dbDates) && dbDates.length > 0) {
                    dbDates.forEach(item => {
                        dates.push({
                            date: item.date,
                            count: item.count || 0,
                            source: 'database'
                        });
                    });
                }
            }
            
            // Fallback: also try the save-uploaded-data endpoint to get all files
            if (dates.length === 0) {
                const filesResponse = await fetch('/api/save-uploaded-data');
                if (filesResponse.ok) {
                    const result = await filesResponse.json();
                    if (result.success && result.data && Array.isArray(result.data)) {
                        // Group by date and use the most recent file's count for each date
                        const dateMap = new Map();
                        result.data.forEach(file => {
                            if (file.date) {
                                const indicesCount = Array.isArray(file.indices) ? file.indices.length : (file.indicesCount || 0);
                                
                                // If date already exists, keep the one with more indices
                                if (!dateMap.has(file.date) || indicesCount > (dateMap.get(file.date).count || 0)) {
                                    dateMap.set(file.date, {
                                        date: file.date,
                                        count: indicesCount,
                                        source: 'database'
                                    });
                                }
                            }
                        });
                        dates.push(...Array.from(dateMap.values()));
                    }
                }
            }
        } catch (error) {
            console.warn('Could not fetch dates from database:', error);
        }
        
        // Get dates from localStorage as fallback (only if database has no data)
        if (dates.length === 0) {
            const uploadedData = this.getUploadedDataList();
            if (uploadedData && uploadedData.length > 0) {
                uploadedData.forEach(file => {
                    if (file.dataDate && file.dataDate !== 'N/A') {
                        dates.push({
                            date: file.dataDate,
                            count: file.indicesCount || 0,
                            source: 'localStorage'
                        });
                    }
                });
            }
        }
        
        return dates;
    }

    async loadUploadedDataByDate(date) {
        try {
            // Try to load from database first
            const response = await fetch(`/api/get-uploaded-data?date=${encodeURIComponent(date)}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.indices) {
                    // Save to localStorage
                    const processedData = {
                        indices: data.indices,
                        date: date,
                        fileName: `Uploaded CSV - ${date}`,
                        source: 'database'
                    };
                    localStorage.setItem('uploadedIndicesData', JSON.stringify(processedData));
                    
                    // Set as active API
                    this.settings.activeApi = 'uploaded';
                    this.settings.uploadedDataDate = date;
                    this.saveSettings();
                    
                    // Show notification
                    this.showNotification(`Loaded data for ${date}`, 'success');
                    
                    // Close settings modal
                    this.closeSettings();
                    
                    // Reload app with uploaded data
                    if (window.marketMoodApp) {
                        window.marketMoodApp.loadData();
                    }
                    return;
                }
            }
        } catch (error) {
            console.warn('Could not load from database, trying localStorage:', error);
        }
        
        // Fallback to localStorage
        const uploadedData = this.getUploadedDataList();
        if (uploadedData && uploadedData.length > 0) {
            const file = uploadedData.find(f => f.dataDate === date);
            if (file) {
                // Load from localStorage
                const stored = localStorage.getItem('uploadedIndicesData');
                if (stored) {
                    const data = JSON.parse(stored);
                    if (data.date === date) {
                        // Set as active API
                        this.settings.activeApi = 'uploaded';
                        this.settings.uploadedDataDate = date;
                        this.saveSettings();
                        
                        // Show notification
                        this.showNotification(`Loaded data for ${date}`, 'success');
                        
                        // Close settings modal
                        this.closeSettings();
                        
                        // Reload app with uploaded data
                        if (window.marketMoodApp) {
                            window.marketMoodApp.loadData();
                        }
                        return;
                    }
                }
            }
        }
        
        this.showNotification(`No data found for ${date}`, 'error');
    }

    selectUploadedFile(index) {
        const uploadedDataList = this.getUploadedDataList();
        if (uploadedDataList[index]) {
            // Set uploaded as active API
            this.settings.activeApi = 'uploaded';
            this.saveSettings();
            this.updateApiList();
            this.updateActiveApiDisplay();
            this.showNotification('Switched to uploaded data', 'success');
            
            // Reload app with uploaded data
            if (window.marketMoodApp) {
                window.marketMoodApp.loadData();
            }
        }
    }

    updateUploadedDataSection() {
        // Check if uploaded data exists - try both possible keys
        let uploadedData = localStorage.getItem('uploadedIndicesData');
        if (!uploadedData) {
            // Fallback to old key name
            uploadedData = localStorage.getItem('uploadedMarketData');
        }
        
        const uploadedSection = document.getElementById('uploadedDataSection');
        
        if (!uploadedSection) {
            console.warn('uploadedDataSection element not found');
            return;
        }
        
        if (uploadedData) {
            try {
                const data = JSON.parse(uploadedData);
                const sourceEl = document.getElementById('uploadedDataSource');
                const dateEl = document.getElementById('uploadedDataDate');
                const countEl = document.getElementById('uploadedDataCount');
                
                if (sourceEl) sourceEl.textContent = data.fileName || data.source || 'Uploaded CSV';
                if (dateEl) dateEl.textContent = data.date || data.dataDate || 'N/A';
                if (countEl) countEl.textContent = data.indices?.length || 0;
                
                // Use classList for consistent display handling
                uploadedSection.classList.add('show');
                // Also set display style directly as fallback for iOS Safari
                uploadedSection.style.display = 'block';
                
                console.log('Uploaded data section shown:', {
                    fileName: data.fileName || data.source,
                    date: data.date || data.dataDate,
                    count: data.indices?.length || 0
                });
            } catch (e) {
                console.error('Error parsing uploaded data in settings:', e);
                uploadedSection.classList.remove('show');
                uploadedSection.style.display = 'none';
            }
        } else {
            uploadedSection.classList.remove('show');
            uploadedSection.style.display = 'none';
            console.log('No uploaded data found in localStorage');
        }
    }

    updateApiList() {
        const apiListContainer = document.getElementById('apiList');
        if (!apiListContainer) {
            console.error('apiList container not found - modal may not be ready');
            // Try to find it again after a short delay
            setTimeout(() => {
                const retryContainer = document.getElementById('apiList');
                if (retryContainer) {
                    this.updateApiList();
                } else {
                    console.error('apiList container still not found after retry');
                }
            }, 50);
            return;
        }

        // Clear container completely, including any existing Upload CSV Data options
        apiListContainer.innerHTML = '';
        
        // Remove any existing Upload CSV Data items that might have been added
        const existingUploadItems = apiListContainer.querySelectorAll('[data-api-type="uploaded"]');
        existingUploadItems.forEach(item => item.remove());
        
        Object.entries(this.settings.apis).forEach(([key, api]) => {
            // Skip uploaded data from main API list - it will be shown separately
            if (key === 'uploaded') {
                return;
            }
            
            const apiItem = document.createElement('div');
            apiItem.className = 'api-item';
            
            // Create collapsible details for each API
            const details = document.createElement('details');
            details.className = 'api-item-collapsible';
            if (this.settings.activeApi === key) {
                details.open = true; // Open the active API by default
            }
            
            const summary = document.createElement('summary');
            summary.className = 'api-item-header';
            summary.innerHTML = `
                <label class="api-radio">
                    <input type="radio" name="activeApi" value="${key}" ${this.settings.activeApi === key ? 'checked' : ''}>
                    <span class="api-name">${api.name}</span>
                </label>
                <span class="api-status ${api.testStatus === 'success' ? 'enabled' : api.testStatus === 'failed' ? 'disabled' : (api.enabled ? 'enabled' : 'disabled')}">
                    ${api.testStatus === 'success' ? '✓ Connected' : api.testStatus === 'failed' ? '✗ Failed' : (api.enabled ? '✓ Enabled' : '✗ Not Tested')}
                </span>
                <svg class="api-collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            
            // Add description based on API type
            let apiDescription = '';
            if (key === 'nse') {
                apiDescription = '<p class="api-description" style="font-size: 0.85rem; color: #666; margin: 5px 0 10px 0;">✅ Recommended for Market Mood Box - Provides indices data (NIFTY 50, BANK NIFTY, etc.)</p>';
            } else if (key === 'dhan') {
                apiDescription = '<p class="api-description" style="font-size: 0.85rem; color: #666; margin: 5px 0 10px 0;">💡 Use for stocks/equities data and backtesting - Requires numeric securityIds (indices not directly supported)</p>';
            }
            
            const content = document.createElement('div');
            content.className = 'api-item-content';
            content.innerHTML = `
                ${apiDescription}
                ${api.type === 'dhan' ? `
                    <form class="api-config-form" id="config-${key}" onsubmit="return false;">
                        <input type="text" placeholder="Client ID" class="form-control api-input" 
                               data-api="${key}" data-field="clientId" value="${api.config.clientId || ''}">
                        <div class="password-input-wrapper">
                            <input type="password" placeholder="Access Token" class="form-control api-input password-input" 
                                   data-api="${key}" data-field="accessToken" 
                                   id="token-${key}" value="${api.config.accessToken || ''}">
                            <button type="button" class="toggle-password" data-target="token-${key}" title="Show/Hide">
                                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </div>
                        <details class="api-advanced-config">
                            <summary style="cursor: pointer; color: #667eea; margin: 10px 0; font-size: 0.9rem;">Advanced (API Key & Secret - Optional)</summary>
                            <div style="margin-top: 10px;">
                                <input type="text" placeholder="API Key (for v2.4+)" class="form-control api-input" 
                                       data-api="${key}" data-field="apiKey" value="${api.config.apiKey || ''}">
                                <div class="password-input-wrapper">
                                    <input type="password" placeholder="API Secret (for v2.4+)" class="form-control api-input password-input" 
                                           data-api="${key}" data-field="apiSecret" 
                                           id="secret-${key}" value="${api.config.apiSecret || ''}">
                                    <button type="button" class="toggle-password" data-target="secret-${key}" title="Show/Hide">
                                        <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </details>
                        <input type="text" placeholder="Custom Endpoint (optional, e.g., /market-quote/indices)" 
                               class="form-control api-input" 
                               data-api="${key}" data-field="customEndpoint" 
                               value="${api.config.customEndpoint || ''}">
                        <small class="endpoint-hint">Leave empty to auto-detect. Check <a href="https://dhanhq.co/docs/v2/" target="_blank">Dhan API v2 docs</a> if auto-detection fails.</small>
                        <div class="dhan-info-box">
                            <strong>⚠️ Important:</strong> Dhan API doesn't provide direct indices data. It's best for:<br>
                            • Stocks/Equities data (with numeric securityIds)<br>
                            • Backtesting and trading strategies<br><br>
                            <strong>For Market Mood Box:</strong> Use NSE India API (recommended for indices like NIFTY 50, BANK NIFTY, etc.)<br><br>
                            Dhan API requires active Data API subscription. Check at <a href="https://web.dhan.co" target="_blank">web.dhan.co</a> → My Profile → DhanHQ Trading APIs
                        </div>
                        <button type="button" class="btn-secondary test-api-btn" data-api="${key}">Test Connection</button>
                    </form>
                ` : ''}
            `;
            
            details.appendChild(summary);
            details.appendChild(content);
            apiItem.appendChild(details);
            apiListContainer.appendChild(apiItem);
        });
        
        // Add Upload CSV Data as a selectable option
        this.addUploadCSVDataOption(apiListContainer);

        // Add event listeners
        document.querySelectorAll('input[name="activeApi"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.settings.activeApi = e.target.value;
                this.updateActiveApiDisplay();
            });
        });

        document.querySelectorAll('.api-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const apiKey = e.target.dataset.api;
                const field = e.target.dataset.field;
                if (this.settings.apis[apiKey]) {
                    this.settings.apis[apiKey].config[field] = e.target.value;
                }
            });
        });

        document.querySelectorAll('.test-api-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const apiKey = e.target.dataset.api;
                this.testApiConnection(apiKey);
            });
        });

        // Add toggle password functionality
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.closest('.toggle-password').dataset.target;
                const input = document.getElementById(targetId);
                const eyeIcon = e.target.closest('.toggle-password').querySelector('.eye-icon');
                
                if (input && eyeIcon) {
                    const eyeIconSvg = eyeIcon.querySelector('svg');
                    if (input.type === 'password') {
                        input.type = 'text';
                        // Change to eye-off icon
                        if (eyeIconSvg) {
                            eyeIconSvg.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
                        }
                        btn.title = 'Hide';
                    } else {
                        input.type = 'password';
                        // Change back to eye icon
                        if (eyeIconSvg) {
                            eyeIconSvg.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
                        }
                        btn.title = 'Show';
                    }
                }
            });
        });
    }

    updateActiveApiDisplay() {
        const activeApi = document.getElementById('activeApi');
        const dataSource = document.getElementById('dataSource');
        const apiStatus = document.getElementById('apiStatus');
        const activeApiObj = this.settings.apis[this.settings.activeApi];

        if (activeApi) {
            activeApi.textContent = activeApiObj ? activeApiObj.name : 'NSE India';
        }

        if (dataSource) {
            dataSource.textContent = activeApiObj ? activeApiObj.name : 'NSE India';
        }
        
        // Update status badge in Current Status section
        if (apiStatus && activeApiObj) {
            if (activeApiObj.type === 'dhan') {
                if (activeApiObj.testStatus === 'success') {
                    apiStatus.textContent = 'Connected';
                    apiStatus.className = 'status-badge';
                } else if (activeApiObj.testStatus === 'failed') {
                    apiStatus.textContent = 'Connection Failed';
                    apiStatus.className = 'status-badge error';
                } else if (activeApiObj.enabled) {
                    apiStatus.textContent = 'Not Tested';
                    apiStatus.className = 'status-badge';
                } else {
                    apiStatus.textContent = 'Not Configured';
                    apiStatus.className = 'status-badge error';
                }
            } else {
                // NSE API - always connected (free API)
                apiStatus.textContent = 'Connected';
                apiStatus.className = 'status-badge';
            }
        }
    }

    updateConfigForms() {
        // Update any specific form fields if needed
        const dhanApi = this.settings.apis.dhan;
        if (dhanApi) {
            const clientIdInput = document.querySelector('[data-api="dhan"][data-field="clientId"]');
            const tokenInput = document.querySelector('[data-api="dhan"][data-field="accessToken"]');
            
            if (clientIdInput) {
                clientIdInput.value = dhanApi.config.clientId || '';
            }
            if (tokenInput) {
                tokenInput.value = dhanApi.config.accessToken || '';
            }
        }
    }

    setupEventListeners() {
        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettings = document.getElementById('closeSettings');
        const cancelSettings = document.getElementById('cancelSettings');
        const saveSettings = document.getElementById('saveSettings');
        const apiProvider = document.getElementById('apiProvider');
        const testDhanBtn = document.getElementById('testDhanBtn');

        // Expose openSettingsModal method
        this.openSettingsModal = () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                settingsModal.classList.add('show');
                // Use setTimeout to ensure modal is visible before updating content
                setTimeout(() => {
                    // Refresh settings in modal when opened
                    try {
                        this.updateApiList();
                        this.updateActiveApiDisplay();
                        this.updateConfigForms();
                        this.updateUploadedDataSection();
                    } catch (error) {
                        console.error('Error updating settings modal:', error);
                        // Fallback: try again after a short delay
                        setTimeout(() => {
                            this.updateApiList();
                            this.updateActiveApiDisplay();
                            this.updateConfigForms();
                            this.updateUploadedDataSection();
                        }, 100);
                    }
                }, 10);
            }
        };

        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                this.openSettingsModal();
                // Use setTimeout to ensure modal is visible before updating content
                setTimeout(() => {
                    // Refresh settings in modal when opened
                    try {
                        this.updateApiList();
                        this.updateActiveApiDisplay();
                        this.updateConfigForms();
                        this.updateUploadedDataSection();
                    } catch (error) {
                        console.error('Error updating settings modal:', error);
                        // Fallback: try again after a short delay
                        setTimeout(() => {
                            this.updateApiList();
                            this.updateActiveApiDisplay();
                            this.updateConfigForms();
                            this.updateUploadedDataSection();
                        }, 100);
                    }
                }, 10);
            });
        }

        if (closeSettings) {
            closeSettings.addEventListener('click', () => {
                settingsModal.classList.remove('show');
            });
        }

        if (cancelSettings) {
            cancelSettings.addEventListener('click', () => {
                settingsModal.classList.remove('show');
            });
        }

        // Close modal when clicking outside
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.classList.remove('show');
                }
            });
        }

        if (saveSettings) {
            saveSettings.addEventListener('click', () => {
                this.saveCurrentSettings();
            });
        }

        // Clear uploaded data button
        const clearUploadedDataBtn = document.getElementById('clearUploadedDataBtn');
        if (clearUploadedDataBtn) {
            clearUploadedDataBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the uploaded data? This will switch back to API data.')) {
                    localStorage.removeItem('uploadedMarketData');
                    localStorage.removeItem('uploadedIndicesData'); // Also check old key
                    this.updateUploadedDataSection();
                    this.showNotification('Uploaded data cleared. Switching to API data.', 'success');
                    
                    // Reload app data
                    if (window.marketMoodApp) {
                        window.marketMoodApp.loadData();
                    }
                }
            });
        }

        // Event listeners are now set up in updateApiList()
    }

    saveCurrentSettings() {
        // Save all API configurations from the form
        Object.keys(this.settings.apis).forEach(apiKey => {
            const api = this.settings.apis[apiKey];
            if (api.type === 'dhan') {
                const clientIdInput = document.querySelector(`[data-api="${apiKey}"][data-field="clientId"]`);
                const tokenInput = document.querySelector(`[data-api="${apiKey}"][data-field="accessToken"]`);
                
                const customEndpointInput = document.querySelector(`[data-api="${apiKey}"][data-field="customEndpoint"]`);
                const apiKeyInput = document.querySelector(`[data-api="${apiKey}"][data-field="apiKey"]`);
                const apiSecretInput = document.querySelector(`[data-api="${apiKey}"][data-field="apiSecret"]`);
                
                if (clientIdInput) {
                    api.config.clientId = clientIdInput.value.trim();
                }
                if (tokenInput) {
                    api.config.accessToken = tokenInput.value.trim();
                }
                if (apiKeyInput) {
                    api.config.apiKey = apiKeyInput.value.trim();
                }
                if (apiSecretInput) {
                    api.config.apiSecret = apiSecretInput.value.trim();
                }
                if (customEndpointInput) {
                    api.config.customEndpoint = customEndpointInput.value.trim();
                }
                // Enable API if credentials are provided
                api.enabled = !!(api.config.clientId && api.config.accessToken);
            }
        });

        // Get active API from radio buttons
        const activeRadio = document.querySelector('input[name="activeApi"]:checked');
        if (activeRadio) {
            const selectedApi = this.settings.apis[activeRadio.value];
            
            // Validate: Don't allow saving Dhan API as active if test failed
            if (selectedApi && selectedApi.type === 'dhan') {
                // Check if credentials are provided
                if (!selectedApi.config.clientId || !selectedApi.config.accessToken) {
                    this.showNotification('Please enter Dhan API credentials before saving', 'error');
                    return;
                }
                
                // Check if test was successful
                if (selectedApi.testStatus === 'failed') {
                    const confirmSave = confirm(
                        'Dhan API test connection failed. Saving will switch to Dhan API which may not work.\n\n' +
                        'Do you want to continue anyway?\n\n' +
                        'Recommendation: Fix the API connection first or use NSE India instead.'
                    );
                    
                    if (!confirmSave) {
                        return; // Don't save if user cancels
                    }
                } else if (!selectedApi.tested) {
                    // Not tested yet - warn user
                    const confirmSave = confirm(
                        'Dhan API has not been tested yet. It\'s recommended to test the connection first.\n\n' +
                        'Do you want to save without testing?'
                    );
                    
                    if (!confirmSave) {
                        return; // Don't save if user cancels
                    }
                }
            }
            
            this.settings.activeApi = activeRadio.value;
        }

        this.saveSettings();
        
        // Close modal
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.classList.remove('show');
        }

        // Notify app to reload with new API
        if (window.marketMoodApp) {
            window.marketMoodApp.reloadWithNewAPI();
        }

        // Show success message
        this.showNotification('Settings saved successfully!');
    }

    async testApiConnection(apiKeyParam) {
        const api = this.settings.apis[apiKeyParam];
        if (!api || api.type !== 'dhan') {
            return;
        }

        const clientId = api.config.clientId?.trim();
        const token = api.config.accessToken?.trim();
        const apiKey = api.config.apiKey?.trim();
        const apiSecret = api.config.apiSecret?.trim();
        const customEndpoint = api.config.customEndpoint?.trim();

        if (!token) {
            this.showNotification('Please enter Access Token (required)', 'error');
            return;
        }
        
        // Client ID is recommended but not always required for v2.4+
        if (!clientId && !apiKey) {
            this.showNotification('Please enter either Client ID or API Key', 'error');
            return;
        }

        // Find status badge for this API
        const apiItem = document.querySelector(`[data-api="${apiKeyParam}"]`)?.closest('.api-item');
        let statusBadge = apiItem?.querySelector('.api-status');

        // Mark as being tested
        api.tested = true;
        api.testStatus = null;

        if (statusBadge) {
            statusBadge.textContent = 'Testing...';
            statusBadge.className = 'api-status testing';
        }

        try {
            const response = await fetch('/api/test-dhan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    clientId: clientId,
                    accessToken: token,
                    apiKey: apiKey,
                    apiSecret: apiSecret,
                    customEndpoint: customEndpoint
                })
            });

            const data = await response.json();

            if (data.success) {
                if (statusBadge) {
                    statusBadge.textContent = '✓ Connected';
                    statusBadge.className = 'api-status enabled';
                }
                api.enabled = true;
                api.testStatus = 'success';
                this.showNotification(`${api.name} connection successful!`, 'success');
            } else {
                if (statusBadge) {
                    statusBadge.textContent = '✗ Failed';
                    statusBadge.className = 'api-status disabled';
                }
                api.enabled = false;
                api.testStatus = 'failed';
                this.showNotification(data.message || 'Connection failed', 'error');
            }
        } catch (error) {
            if (statusBadge) {
                statusBadge.textContent = '✗ Error';
                statusBadge.className = 'api-status disabled';
            }
            api.enabled = false;
            api.testStatus = 'failed';
            this.showNotification('Failed to test connection', 'error');
        }
        
        // Update the settings to reflect test status
        this.saveSettings();
    }

    showNotification(message, type = 'success') {
        // Simple notification - you can enhance this
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    getSettings() {
        return { ...this.settings };
    }

    getApiProvider() {
        return this.settings.activeApi || 'nse';
    }

    getActiveApiConfig() {
        const activeApi = this.settings.apis[this.settings.activeApi];
        return activeApi || this.settings.apis.nse;
    }
}

// Initialize settings manager
window.settingsManager = new SettingsManager();

