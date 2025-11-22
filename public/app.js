class MarketMoodApp {
    constructor() {
        this.apiUrl = '/api/nse-data';
        this.timerId = null;
        this.init();
    }

    init() {
        this.updateTimeEl = document.getElementById('updateTime');
        this.refreshBtn = document.getElementById('refreshBtn');

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.handleManualRefresh());
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // When tab becomes visible again, fetch fresh data and adjust polling
                this.loadData();
                if (this.isMarketOpen()) {
                    this.startPolling();
                } else {
                    this.stopPolling();
                }
            }
        });

        this.loadData();
        // Start polling only if market is open
        if (this.isMarketOpen()) {
            this.startPolling();
        }
    }

    async loadData() {
        try {
            this.setLoading(true);
            console.log('Fetching from:', this.apiUrl);

            const response = await fetch(this.apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Data received:', data);
            this.updateUI(data);
            this.updateLastUpdated(new Date());

        } catch (error) {
            console.error('Error fetching data:', error);
            this.useMockData();
            this.updateLastUpdated(new Date());
        } finally {
            this.setLoading(false);
        }
    }

    useMockData() {
        console.log('Using mock data as fallback');
        const mockData = {
            mood: { score: 65, text: 'Bullish 😊', emoji: '😊' },
            nifty: { last: 21500.45, change: 125.50, pChange: 0.59 },
            bankNifty: { last: 47500.75, change: 280.25, pChange: 0.59 },
            vix: { last: 14.25, change: -0.35, pChange: -2.40 },
            advanceDecline: { advances: 28, declines: 17 },
            note: 'Mock Data'
        };
        this.updateUI(mockData);
    }

    startPolling() {
        // Only poll automatically during market hours (every 30s)
        if (!this.isMarketOpen()) {
            this.stopPolling();
            return;
        }

        const interval = 30_000; // 30s during market hours

        if (this.timerId) {
            clearInterval(this.timerId);
        }

        this.timerId = setInterval(() => {
            // If market is still open, fetch; otherwise, stop polling
            if (this.isMarketOpen()) {
                this.loadData();
            } else {
                this.stopPolling();
            }
        }, interval);
    }

    stopPolling() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    handleManualRefresh() {
        this.loadData();
    }

    isMarketOpen() {
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

        // Update NIFTY, BANK NIFTY, VIX
        const setData = (idVal, idChange, obj) => {
            const valEl = document.getElementById(idVal);
            const changeEl = document.getElementById(idChange);
            
            if (valEl) {
                if (obj && obj.last != null) {
                    valEl.textContent = typeof obj.last === 'number' ? obj.last.toFixed(2) : obj.last;
                } else {
                    valEl.textContent = '-';
                }
            }
            
            if (changeEl) {
                if (obj && obj.change != null && obj.pChange != null) {
                    const change = typeof obj.change === 'number' ? obj.change.toFixed(2) : obj.change;
                    const pChange = typeof obj.pChange === 'number' ? obj.pChange.toFixed(2) : obj.pChange;
                    const sign = obj.change >= 0 ? '+' : '';
                    changeEl.textContent = `${sign}${change} (${sign}${pChange}%)`;
                    
                    // Add color classes for positive/negative
                    changeEl.classList.remove('positive', 'negative');
                    if (obj.change > 0) {
                        changeEl.classList.add('positive');
                    } else if (obj.change < 0) {
                        changeEl.classList.add('negative');
                    }
                } else {
                    changeEl.textContent = '-';
                    changeEl.classList.remove('positive', 'negative');
                }
            }
        };

        setData('niftyValue', 'niftyChange', data.nifty);
        setData('bankNiftyValue', 'bankNiftyChange', data.bankNifty);
        setData('vixValue', 'vixChange', data.vix);

        // Advance/Decline
        const adv = document.getElementById('advances');
        const dec = document.getElementById('declines');
        if (adv) adv.textContent = (data.advanceDecline && data.advanceDecline.advances != null) ? data.advanceDecline.advances : '-';
        if (dec) dec.textContent = (data.advanceDecline && data.advanceDecline.declines != null) ? data.advanceDecline.declines : '-';
    }

    updateBackgroundColor(score) {
        // Update body background based on mood score
        const body = document.body;
        if (!body) return;

        let gradient;
        if (score >= 70) {
            // Very Bullish - Green gradient
            gradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else if (score >= 60) {
            // Bullish - Light green gradient
            gradient = 'linear-gradient(135deg, #34d399 0%, #10b981 100%)';
        } else if (score >= 50) {
            // Slightly Bullish - Yellow/Green gradient
            gradient = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
        } else if (score >= 40) {
            // Neutral - Orange gradient
            gradient = 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
        } else if (score >= 30) {
            // Slightly Bearish - Orange/Red gradient
            gradient = 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)';
        } else if (score >= 20) {
            // Bearish - Red gradient
            gradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        } else {
            // Very Bearish - Dark red gradient
            gradient = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
        }

        body.style.background = gradient;
    }

    setLoading(isLoading) {
        if (this.refreshBtn) {
            this.refreshBtn.disabled = isLoading;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.marketMoodApp = new MarketMoodApp();
});