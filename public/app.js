class MarketMoodApp {
    constructor() {
        this.apiUrl = '/api/nse-data';
        this.init();
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
            
        } catch (error) {
            console.error('Error fetching data:', error);
            this.useMockData();
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

    // ... rest of your existing methods
}