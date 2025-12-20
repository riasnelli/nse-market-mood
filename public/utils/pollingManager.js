/**
 * Centralized Polling Manager
 * Supports multiple channels with adaptive intervals based on volatility
 */

const DEBUG = false; // Set to true for verbose logging

class PollingManager {
    constructor() {
        this.channels = {
            moodChannel: {
                name: 'mood',
                baseIntervalMs: 15000, // 15 seconds
                currentIntervalMs: 15000,
                timerId: null,
                lastFetchTime: null,
                consecutiveFailures: 0,
                maxFailures: 3,
                fetchFn: null,
                adaptiveFactor: 1.0
            },
            keyIndicesChannel: {
                name: 'keyIndices',
                baseIntervalMs: 10000, // 10 seconds
                currentIntervalMs: 10000,
                timerId: null,
                lastFetchTime: null,
                consecutiveFailures: 0,
                maxFailures: 3,
                fetchFn: null,
                adaptiveFactor: 1.0
            },
            allIndicesChannel: {
                name: 'allIndices',
                baseIntervalMs: 30000, // 30 seconds
                currentIntervalMs: 30000,
                timerId: null,
                lastFetchTime: null,
                consecutiveFailures: 0,
                maxFailures: 3,
                fetchFn: null,
                adaptiveFactor: 1.0
            }
        };
        
        this.isPaused = false;
        this.lastVolatilityData = null;
        this.marketOpenCheckFn = null;
        this.onVisibilityChange = this.handleVisibilityChange.bind(this);
        
        // Setup visibility change handler
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.onVisibilityChange);
        }
    }

    /**
     * Register a fetch function for a channel
     */
    registerChannel(channelName, fetchFn) {
        if (this.channels[channelName]) {
            this.channels[channelName].fetchFn = fetchFn;
            if (DEBUG) console.log(`[PollingManager] Registered ${channelName}`);
        }
    }

    /**
     * Set market open check function
     */
    setMarketOpenCheck(fn) {
        this.marketOpenCheckFn = fn;
    }

    /**
     * Start a channel
     */
    start(channelName) {
        const channel = this.channels[channelName];
        if (!channel) {
            console.warn(`[PollingManager] Unknown channel: ${channelName}`);
            return;
        }

        if (channel.timerId) {
            this.stop(channelName);
        }

        if (!channel.fetchFn) {
            console.warn(`[PollingManager] No fetch function registered for ${channelName}`);
            return;
        }

        // Check if market is open
        if (this.marketOpenCheckFn && !this.marketOpenCheckFn()) {
            if (DEBUG) console.log(`[PollingManager] Market closed - not starting ${channelName}`);
            return;
        }

        if (this.isPaused) {
            if (DEBUG) console.log(`[PollingManager] Paused - not starting ${channelName}`);
            return;
        }

        const tick = async () => {
            if (this.isPaused) return;
            
            // Check market status before each fetch
            if (this.marketOpenCheckFn && !this.marketOpenCheckFn()) {
                this.stop(channelName);
                return;
            }

            try {
                channel.lastFetchTime = Date.now();
                await channel.fetchFn();
                channel.consecutiveFailures = 0;
                
                // Reset interval on success
                this.updateChannelInterval(channelName);
            } catch (error) {
                channel.consecutiveFailures++;
                console.error(`[PollingManager] ${channelName} fetch failed:`, error);
                
                // Backoff on failure
                const backoffInterval = Math.min(
                    channel.currentIntervalMs * 1.5,
                    channel.baseIntervalMs * 3
                );
                channel.currentIntervalMs = backoffInterval;
                
                if (channel.consecutiveFailures >= channel.maxFailures) {
                    console.warn(`[PollingManager] ${channelName} stopped after ${channel.maxFailures} failures`);
                    this.stop(channelName);
                } else {
                    // Reschedule with backoff
                    channel.timerId = setTimeout(tick, channel.currentIntervalMs);
                }
                return;
            }

            // Schedule next tick
            channel.timerId = setTimeout(tick, channel.currentIntervalMs);
        };

        // Start immediately
        tick();
        
        if (DEBUG) console.log(`[PollingManager] Started ${channelName} with interval ${channel.currentIntervalMs}ms`);
    }

    /**
     * Stop a channel
     */
    stop(channelName) {
        const channel = this.channels[channelName];
        if (!channel) return;

        if (channel.timerId) {
            clearTimeout(channel.timerId);
            channel.timerId = null;
            if (DEBUG) console.log(`[PollingManager] Stopped ${channelName}`);
        }
    }

    /**
     * Stop all channels
     */
    stopAll() {
        Object.keys(this.channels).forEach(channelName => {
            this.stop(channelName);
        });
    }

    /**
     * Trigger immediate fetch for a channel
     */
    tickNow(channelName) {
        const channel = this.channels[channelName];
        if (!channel || !channel.fetchFn) return;

        if (DEBUG) console.log(`[PollingManager] Immediate tick for ${channelName}`);
        
        channel.fetchFn().catch(error => {
            console.error(`[PollingManager] Immediate tick failed for ${channelName}:`, error);
        });
    }

    /**
     * Set adaptive factor based on volatility
     */
    setAdaptiveFactor(channelName, factor) {
        const channel = this.channels[channelName];
        if (!channel) return;

        channel.adaptiveFactor = factor;
        this.updateChannelInterval(channelName);
    }

    /**
     * Update channel interval based on adaptive factor
     */
    updateChannelInterval(channelName) {
        const channel = this.channels[channelName];
        if (!channel) return;

        // Calculate new interval
        let newInterval = channel.baseIntervalMs * channel.adaptiveFactor;

        // Apply min/max constraints
        const minInterval = channelName === 'allIndicesChannel' ? 30000 : 10000;
        const maxInterval = 60000;
        
        newInterval = Math.max(minInterval, Math.min(maxInterval, newInterval));
        
        channel.currentIntervalMs = newInterval;

        if (DEBUG && channel.adaptiveFactor !== 1.0) {
            console.log(`[PollingManager] ${channelName} interval: ${channel.currentIntervalMs}ms (factor: ${channel.adaptiveFactor.toFixed(2)})`);
        }
    }

    /**
     * Update volatility data and recalculate adaptive factors
     */
    updateVolatilityData(data) {
        this.lastVolatilityData = data;
        
        // Calculate volatility intensity
        const niftyChangePct = Math.abs(data.niftyChangePct || 0);
        const vixChangePct = Math.abs(data.vixChangePct || 0);
        const intensity = Math.max(niftyChangePct, vixChangePct);

        // Map intensity to multiplier
        let multiplier = 1.0;
        if (intensity < 0.20) {
            multiplier = 1.5; // Slower when flat
        } else if (intensity >= 0.20 && intensity <= 0.60) {
            multiplier = 1.0; // Base speed
        } else {
            multiplier = 0.67; // Faster when volatile
        }

        // Apply to all channels
        this.setAdaptiveFactor('moodChannel', multiplier);
        this.setAdaptiveFactor('keyIndicesChannel', multiplier);
        this.setAdaptiveFactor('allIndicesChannel', multiplier);

        if (DEBUG) {
            console.log(`[PollingManager] Volatility intensity: ${intensity.toFixed(2)}%, multiplier: ${multiplier.toFixed(2)}`);
        }
    }

    /**
     * Handle visibility change (pause when hidden, resume when visible)
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Page hidden - pause polling
            this.pause();
        } else {
            // Page visible - resume with staggered ticks
            this.resume();
        }
    }

    /**
     * Pause all polling
     */
    pause() {
        if (this.isPaused) return;
        
        this.isPaused = true;
        this.stopAll();
        
        if (DEBUG) console.log('[PollingManager] Paused (page hidden)');
    }

    /**
     * Resume polling with staggered ticks
     */
    resume() {
        if (!this.isPaused) return;
        
        this.isPaused = false;
        
        // Stagger channel starts by 1-2 seconds to avoid burst
        setTimeout(() => {
            if (this.marketOpenCheckFn && this.marketOpenCheckFn()) {
                this.tickNow('moodChannel');
                this.start('moodChannel');
            }
        }, 0);
        
        setTimeout(() => {
            if (this.marketOpenCheckFn && this.marketOpenCheckFn()) {
                this.tickNow('keyIndicesChannel');
                this.start('keyIndicesChannel');
            }
        }, 1000);
        
        setTimeout(() => {
            if (this.marketOpenCheckFn && this.marketOpenCheckFn()) {
                this.tickNow('allIndicesChannel');
                this.start('allIndicesChannel');
            }
        }, 2000);
        
        if (DEBUG) console.log('[PollingManager] Resumed (page visible)');
    }

    /**
     * Get channel status
     */
    getChannelStatus(channelName) {
        const channel = this.channels[channelName];
        if (!channel) return null;

        return {
            name: channel.name,
            isRunning: !!channel.timerId,
            currentInterval: channel.currentIntervalMs,
            baseInterval: channel.baseIntervalMs,
            adaptiveFactor: channel.adaptiveFactor,
            lastFetchTime: channel.lastFetchTime,
            consecutiveFailures: channel.consecutiveFailures
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopAll();
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.onVisibilityChange);
        }
    }
}

// Export singleton instance
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PollingManager;
}

// Also make available globally
if (typeof window !== 'undefined') {
    window.PollingManager = PollingManager;
}


