// Settings Management
class SettingsManager {
    constructor() {
        this.storageKey = 'nseMarketMoodSettings';
        this.defaultSettings = {
            apiProvider: 'nse',
            dhanClientId: '',
            dhanAccessToken: ''
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
                this.settings = JSON.parse(saved);
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
        const providerSelect = document.getElementById('apiProvider');
        const dhanConfig = document.getElementById('dhanConfig');
        const activeApi = document.getElementById('activeApi');
        const dataSource = document.getElementById('dataSource');

        if (providerSelect) {
            providerSelect.value = this.settings.apiProvider;
        }

        if (dhanConfig) {
            dhanConfig.style.display = this.settings.apiProvider === 'dhan' ? 'block' : 'none';
        }

        if (activeApi) {
            activeApi.textContent = this.settings.apiProvider === 'dhan' ? 'Dhan API' : 'NSE India';
        }

        if (dataSource) {
            dataSource.textContent = this.settings.apiProvider === 'dhan' ? 'Dhan API' : 'NSE India';
        }

        // Update form fields
        const clientIdInput = document.getElementById('dhanClientId');
        const tokenInput = document.getElementById('dhanAccessToken');
        
        if (clientIdInput) {
            clientIdInput.value = this.settings.dhanClientId || '';
        }
        if (tokenInput) {
            tokenInput.value = this.settings.dhanAccessToken || '';
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

        if (apiProvider) {
            apiProvider.addEventListener('change', (e) => {
                const dhanConfig = document.getElementById('dhanConfig');
                if (dhanConfig) {
                    dhanConfig.style.display = e.target.value === 'dhan' ? 'block' : 'none';
                }
            });
        }

        if (testDhanBtn) {
            testDhanBtn.addEventListener('click', () => {
                this.testDhanConnection();
            });
        }
    }

    saveCurrentSettings() {
        const providerSelect = document.getElementById('apiProvider');
        const clientIdInput = document.getElementById('dhanClientId');
        const tokenInput = document.getElementById('dhanAccessToken');

        if (providerSelect) {
            this.settings.apiProvider = providerSelect.value;
        }

        if (clientIdInput) {
            this.settings.dhanClientId = clientIdInput.value.trim();
        }

        if (tokenInput) {
            this.settings.dhanAccessToken = tokenInput.value.trim();
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

    async testDhanConnection() {
        const clientIdInput = document.getElementById('dhanClientId');
        const tokenInput = document.getElementById('dhanAccessToken');
        const apiStatus = document.getElementById('apiStatus');

        const clientId = clientIdInput?.value.trim();
        const token = tokenInput?.value.trim();

        if (!clientId || !token) {
            this.showNotification('Please enter both Client ID and Access Token', 'error');
            return;
        }

        if (apiStatus) {
            apiStatus.textContent = 'Testing...';
            apiStatus.className = 'status-badge';
        }

        try {
            const response = await fetch('/api/test-dhan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    clientId: clientId,
                    accessToken: token
                })
            });

            const data = await response.json();

            if (data.success) {
                if (apiStatus) {
                    apiStatus.textContent = 'Connected';
                    apiStatus.className = 'status-badge';
                }
                this.showNotification('Dhan API connection successful!', 'success');
            } else {
                if (apiStatus) {
                    apiStatus.textContent = 'Connection Failed';
                    apiStatus.className = 'status-badge error';
                }
                this.showNotification(data.message || 'Connection failed', 'error');
            }
        } catch (error) {
            if (apiStatus) {
                apiStatus.textContent = 'Connection Failed';
                apiStatus.className = 'status-badge error';
            }
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
        return this.settings.apiProvider || 'nse';
    }
}

// Initialize settings manager
window.settingsManager = new SettingsManager();

