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

    updateUploadedDataSection() {
        // Check if uploaded data exists
        const uploadedData = localStorage.getItem('uploadedMarketData');
        const uploadedSection = document.getElementById('uploadedDataSection');
        
        if (uploadedSection) {
            if (uploadedData) {
                try {
                    const data = JSON.parse(uploadedData);
                    document.getElementById('uploadedDataSource').textContent = data.source || 'Uploaded CSV';
                    document.getElementById('uploadedDataDate').textContent = data.dataDate || 'N/A';
                    document.getElementById('uploadedDataCount').textContent = data.indices?.length || 0;
                    uploadedSection.style.display = 'block';
                } catch (e) {
                    uploadedSection.style.display = 'none';
                }
            } else {
                uploadedSection.style.display = 'none';
            }
        }
    }

    updateApiList() {
        const apiListContainer = document.getElementById('apiList');
        if (!apiListContainer) {
            console.warn('apiList container not found');
            return;
        }

        apiListContainer.innerHTML = '';
        
        Object.entries(this.settings.apis).forEach(([key, api]) => {
            const apiItem = document.createElement('div');
            apiItem.className = 'api-item';
            
            // Add description based on API type
            let apiDescription = '';
            if (key === 'nse') {
                apiDescription = '<p class="api-description" style="font-size: 0.85rem; color: #666; margin: 5px 0 10px 0;">✅ Recommended for Market Mood Box - Provides indices data (NIFTY 50, BANK NIFTY, etc.)</p>';
            } else if (key === 'dhan') {
                apiDescription = '<p class="api-description" style="font-size: 0.85rem; color: #666; margin: 5px 0 10px 0;">💡 Use for stocks/equities data and backtesting - Requires numeric securityIds (indices not directly supported)</p>';
            }
            
            apiItem.innerHTML = `
                <div class="api-item-header">
                    <label class="api-radio">
                        <input type="radio" name="activeApi" value="${key}" ${this.settings.activeApi === key ? 'checked' : ''}>
                        <span class="api-name">${api.name}</span>
                    </label>
                    <span class="api-status ${api.testStatus === 'success' ? 'enabled' : api.testStatus === 'failed' ? 'disabled' : (api.enabled ? 'enabled' : 'disabled')}">
                        ${api.testStatus === 'success' ? '✓ Connected' : api.testStatus === 'failed' ? '✗ Failed' : (api.enabled ? '✓ Enabled' : '✗ Not Tested')}
                    </span>
                </div>
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
            apiListContainer.appendChild(apiItem);
        });

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

        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                settingsModal.classList.add('show');
                // Refresh settings in modal when opened
                this.updateApiList();
                this.updateActiveApiDisplay();
                this.updateConfigForms();
                this.updateUploadedDataSection();
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

