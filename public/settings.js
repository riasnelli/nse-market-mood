// Settings Management
class SettingsManager {
    constructor() {
        this.storageKey = 'nseMarketMoodSettings';
        this.isAddingUploadOption = false; // Flag to prevent concurrent calls
        this.defaultSettings = {
            activeApi: 'nse', // Currently active API
            openRouterKey: '', // OpenRouter AI API key
            apis: {
                nse: {
                    name: 'NSE India',
                    type: 'nse',
                    enabled: true,
                    config: {}
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

    lockBodyScroll() {
        document.body.classList.add('body-scroll-lock');
    }

    unlockBodyScroll() {
        document.body.classList.remove('body-scroll-lock');
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
                        activeApi: parsed.apiProvider === 'dhan' ? 'nse' : parsed.apiProvider, // Migrate dhan to nse
                        apis: {
                            nse: {
                                name: 'NSE India',
                                type: 'nse',
                                enabled: true,
                                config: {}
                            },
                            uploaded: {
                                name: 'Uploaded Data',
                                type: 'uploaded',
                                enabled: false,
                                config: {}
                            }
                        }
                    };
                } else {
                    // Remove dhan from parsed settings if it exists
                    if (parsed.apis && parsed.apis.dhan) {
                        delete parsed.apis.dhan;
                    }
                    // Migrate activeApi from dhan to nse if needed
                    if (parsed.activeApi === 'dhan') {
                        parsed.activeApi = 'nse';
                    }
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
        // Prevent concurrent calls
        if (this.isAddingUploadOption) {
            // Silently skip duplicate calls
            return;
        }
        
        // Check if Upload CSV Data option already exists to prevent duplicates
        const existingUploadOption = container.querySelector('[data-api-type="uploaded"]');
        if (existingUploadOption) {
            console.log('Upload CSV Data option already exists, skipping duplicate');
            return;
        }
        
        this.isAddingUploadOption = true;
        
        try {
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
            <span class="api-status ${this.settings.activeApi === 'uploaded' ? 'enabled' : (availableDates.length > 0 ? 'enabled' : 'disabled')}">
                ${this.settings.activeApi === 'uploaded' ? '✓ Connected' : (availableDates.length > 0 ? '✓ Available' : '✗ No Data')}
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
        } finally {
            this.isAddingUploadOption = false;
        }
    }

    async getAvailableDates() {
        const dates = [];
        
        // Get dates from database first (this is where all uploaded files are stored)
        try {
            // Try the new endpoint first
            const datesResponse = await fetch('/api/data?action=dates');
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
                const filesResponse = await fetch('/api/data');
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
            const response = await fetch(`/api/data?action=get&date=${encodeURIComponent(date)}`);
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
            // Element only exists in settings modal, so this is expected if modal isn't open
            return;
        }
        
        if (uploadedData) {
            try {
                const data = JSON.parse(uploadedData);
                const sourceEl = document.getElementById('uploadedDataSource');
                const dateEl = document.getElementById('uploadedDataDate');
                const countEl = document.getElementById('uploadedDataCount');
                
                if (sourceEl) sourceEl.textContent = 'Uploaded Data • Static data from file';
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
                <span class="api-status ${this.settings.activeApi === key ? 'enabled' : (api.testStatus === 'success' || api.enabled ? 'enabled' : 'disabled')}">
                    ${this.settings.activeApi === key ? '✓ Connected' : (api.testStatus === 'success' ? '✓ Ready' : api.testStatus === 'failed' ? '✗ Failed' : (api.enabled ? '✓ Available' : '✗ Not Configured'))}
                </span>
                <svg class="api-collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            
            // Add description based on API type
            let apiDescription = '';
            if (key === 'nse') {
                apiDescription = '<p class="api-description" style="font-size: 0.85rem; color: #666; margin: 5px 0 10px 0;">✅ Recommended for Market Mood Box - Provides indices data (NIFTY 50, BANK NIFTY, etc.)</p>';
            }
            
            const content = document.createElement('div');
            content.className = 'api-item-content';
            content.innerHTML = `
                ${apiDescription}
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

        // Test API button functionality removed - Dhan API no longer supported

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
            // NSE API - show as "Available" (not "Connected" since we can't test it easily)
            // The actual connection will be tested when data is fetched
            apiStatus.textContent = 'Available';
                    apiStatus.className = 'status-badge';
        }
    }

    updateConfigForms() {
        // Update any specific form fields if needed
        // No specific form fields to update currently
    }

    setupEventListeners() {
        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettings = document.getElementById('closeSettings');
        const cancelSettings = document.getElementById('cancelSettings');
        const saveSettings = document.getElementById('saveSettings');
        const apiProvider = document.getElementById('apiProvider');

        // Expose openSettingsModal method
        this.openSettingsModal = () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                settingsModal.classList.add('show');
                this.lockBodyScroll();
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
                this.unlockBodyScroll();
            });
        }

        if (cancelSettings) {
            cancelSettings.addEventListener('click', () => {
                settingsModal.classList.remove('show');
                this.unlockBodyScroll();
            });
        }

        // Close modal when clicking outside
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.classList.remove('show');
                    this.unlockBodyScroll();
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
        // No specific API configurations to save currently

        // Get active API from radio buttons
        const activeRadio = document.querySelector('input[name="activeApi"]:checked');
        if (activeRadio) {
            const selectedApi = this.settings.apis[activeRadio.value];
            
            this.settings.activeApi = activeRadio.value;
        }

        this.saveSettings();
        
        // Close modal
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.classList.remove('show');
            this.unlockBodyScroll();
        }

        // Notify app to reload with new API
        if (window.marketMoodApp) {
            window.marketMoodApp.reloadWithNewAPI();
        }

        // Show success message
        this.showNotification('Settings saved successfully!');
    }

    // testApiConnection function removed - Dhan API no longer supported

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

/* Force: 1764859063 */
