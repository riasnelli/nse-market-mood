class MarketMoodApp {
    constructor() {
        // Change to absolute path for public folder
        this.apiUrl = '/api/nse-data';
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.setupAutoRefresh();
        this.registerServiceWorker();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadData();
        });
    }

    setupAutoRefresh() {
        setInterval(() => {
            this.loadData();
        }, 30000);
    }

    async loadData() {
        try {
            this.setLoading(true);
            
            const response = await fetch(this.apiUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            this.updateUI(data);
            
        } catch (error) {
            console.error('Error fetching data:', error);
            this.showError('Failed to fetch market data');
        } finally {
            this.setLoading(false);
        }
    }

    updateUI(data) {
        document.getElementById('moodEmoji').textContent = data.mood.emoji;
        document.getElementById('moodText').textContent = data.mood.text;
        document.getElementById('scoreFill').style.width = `${data.mood.score}%`;
        document.getElementById('scoreText').textContent = `${data.mood.score}/100`;
        
        this.updateDataCard('nifty', data.nifty);
        this.updateDataCard('bankNifty', data.bankNifty);
        this.updateDataCard('vix', data.vix);
        
        document.getElementById('advances').textContent = data.advanceDecline.advances;
        document.getElementById('declines').textContent = data.advanceDecline.declines;
        
        document.getElementById('updateTime').textContent = new Date().toLocaleTimeString();
        
        this.updateTheme(data.mood.score);
    }

    updateDataCard(type, data) {
        const valueElement = document.getElementById(`${type}Value`);
        const changeElement = document.getElementById(`${type}Change`);
        
        valueElement.textContent = data.last.toFixed(2);
        changeElement.textContent = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${data.pChange >= 0 ? '+' : ''}${data.pChange.toFixed(2)}%)`;
        
        changeElement.className = `data-change ${data.pChange >= 0 ? 'positive' : 'negative'}`;
    }

    updateTheme(score) {
        const body = document.body;
        let gradient;
        
        if (score >= 70) {
            gradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else if (score >= 40) {
            gradient = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        } else {
            gradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        }
        
        body.style.background = gradient;
    }

    setLoading(loading) {
        const body = document.body;
        const refreshBtn = document.getElementById('refreshBtn');
        
        if (loading) {
            body.classList.add('loading');
            refreshBtn.classList.add('pulse');
            refreshBtn.textContent = '⏳ Loading...';
        } else {
            body.classList.remove('loading');
            refreshBtn.classList.remove('pulse');
            refreshBtn.textContent = '🔄 Refresh';
        }
    }

    showError(message) {
        document.getElementById('moodText').textContent = message;
        document.getElementById('moodEmoji').textContent = '❌';
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered');
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MarketMoodApp();
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    setTimeout(() => {
        if (confirm('Install NSE Market Mood app for better experience?')) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted install');
                }
                deferredPrompt = null;
            });
        }
    }, 3000);
});