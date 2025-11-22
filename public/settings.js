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
                    config: {
                        clientId: '',
                        accessToken: '',
                        customEndpoint: '' // Allow custom endpoint override
                    }
                }
            }
        };
        this.init();
    }

    init() {
        this.loadSettings();
        this.setupEventListeners();
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
        // Update UI
        this.updateApiList();
        this.updateActiveApiDisplay();
        this.updateConfigForms();
    }

    updateApiList() {
        const apiListContainer = document.getElementById('apiList');
        if (!apiListContainer) return;

        apiListContainer.innerHTML = '';
        
        Object.entries(this.settings.apis).forEach(([key, api]) => {
            const apiItem = document.createElement('div');
            apiItem.className = 'api-item';
            apiItem.innerHTML = `
                <div class="api-item-header">
                    <label class="api-radio">
                        <input type="radio" name="activeApi" value="${key}" ${this.settings.activeApi === key ? 'checked' : ''}>
                        <span class="api-name">${api.name}</span>
                    </label>
                    <span class="api-status ${api.enabled ? 'enabled' : 'disabled'}">
                        ${api.enabled ? '✓ Enabled' : '✗ Disabled'}
                    </span>
                </div>
                ${api.type === 'dhan' ? `
                    <div class="api-config" id="config-${key}">
                        <input type="text" placeholder="Client ID" class="form-control api-input" 
                               data-api="${key}" data-field="clientId" value="${api.config.clientId || ''}">
                        <input type="password" placeholder="Access Token" class="form-control api-input" 
                               data-api="${key}" data-field="accessToken" value="${api.config.accessToken || ''}">
                        <input type="text" placeholder="Custom Endpoint (optional, e.g., /v2/market-quote/indices)" 
                               class="form-control api-input" 
                               data-api="${key}" data-field="customEndpoint" 
                               value="${api.config.customEndpoint || ''}">
                        <small class="endpoint-hint">Leave empty to auto-detect. Check Dhan API docs if auto-detection fails.</small>
                        <button class="btn-secondary test-api-btn" data-api="${key}">Test Connection</button>
                    </div>
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
    }

    updateActiveApiDisplay() {
        const activeApi = document.getElementById('activeApi');
        const dataSource = document.getElementById('dataSource');
        const activeApiObj = this.settings.apis[this.settings.activeApi];

        if (activeApi) {
            activeApi.textContent = activeApiObj ? activeApiObj.name : 'NSE India';
        }

        if (dataSource) {
            dataSource.textContent = activeApiObj ? activeApiObj.name : 'NSE India';
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
                this.applySettings(); // Refresh settings in modal
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
                
                if (clientIdInput) {
                    api.config.clientId = clientIdInput.value.trim();
                }
                if (tokenInput) {
                    api.config.accessToken = tokenInput.value.trim();
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

    async testApiConnection(apiKey) {
        const api = this.settings.apis[apiKey];
        if (!api || api.type !== 'dhan') {
            return;
        }

        const clientId = api.config.clientId?.trim();
        const token = api.config.accessToken?.trim();
        const customEndpoint = api.config.customEndpoint?.trim();

        if (!clientId || !token) {
            this.showNotification('Please enter both Client ID and Access Token', 'error');
            return;
        }

        // Find status badge for this API
        const apiItem = document.querySelector(`[data-api="${apiKey}"]`)?.closest('.api-item');
        let statusBadge = apiItem?.querySelector('.api-status');

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
                this.showNotification(`${api.name} connection successful!`, 'success');
            } else {
                if (statusBadge) {
                    statusBadge.textContent = '✗ Failed';
                    statusBadge.className = 'api-status disabled';
                }
                api.enabled = false;
                this.showNotification(data.message || 'Connection failed', 'error');
            }
        } catch (error) {
            if (statusBadge) {
                statusBadge.textContent = '✗ Error';
                statusBadge.className = 'api-status disabled';
            }
            api.enabled = false;
            this.showNotification('Failed to test connection', 'error');
        }
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

