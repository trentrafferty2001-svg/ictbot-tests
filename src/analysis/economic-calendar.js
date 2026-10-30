// src/analysis/economic-calendar.js
const logger = require('../logger');

class EconomicCalendar {
    constructor() {
        this.cache = { data: null, timestamp: 0 };
        this.TTL = 60 * 60 * 1000; // 1 hour
        this.FAILURE_BACKOFF = 15 * 60 * 1000; // wait 15 min after a failure before retrying
        this.lastFailure = 0;
        this._pending = null;
    }

    async fetchEvents() {
        const now = Date.now();
        if (this.cache.data && now - this.cache.timestamp < this.TTL) return this.cache.data;

        // Don't hammer the API every cycle while it's rate-limiting us
        if (this.lastFailure && now - this.lastFailure < this.FAILURE_BACKOFF) {
            return this.cache.data || [];
        }

        // Prevent concurrent requests
        if (this._pending) {
            logger.info('[EconomicCalendar] Waiting for pending request');
            return this._pending;
        }

        this._pending = this._doFetch();
        try {
            const result = await this._pending;
            return result;
        } finally {
            this._pending = null;
        }
    }

    async _doFetch() {
        try {
            const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

            try {
                const resp = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                });
                clearTimeout(timeout);

                if (resp.status === 429) {
                    this.lastFailure = Date.now();
                    logger.warn('[EconomicCalendar] Rate limited (429), backing off 15min' + (this.cache.data ? ', using cached data' : ''));
                    if (this.cache.data) return this.cache.data;
                    return [];
                }
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

                const data = await resp.json();
                const events = data.filter(e => {
                    const impact = e.impact || 'Medium';
                    return (e.country === 'USD' || e.country === 'XAU') && (impact === 'High' || impact === 'Medium');
                }).map(e => ({
                    title: e.title || e.name || 'Unknown event',
                    date: new Date(e.date),
                    impact: e.impact || 'Medium',
                    country: e.country || 'USD',
                    actual: e.actual,
                    forecast: e.forecast,
                    previous: e.previous
                }));
                this.cache.data = events;
                this.cache.timestamp = Date.now();
                this.lastFailure = 0;
                return events;
            } catch (fetchError) {
                clearTimeout(timeout);
                if (fetchError.name === 'AbortError') {
                    this.lastFailure = Date.now();
                    logger.warn('[EconomicCalendar] Request timeout (8s), backing off 15min' + (this.cache.data ? ', using cached data' : ''));
                    if (this.cache.data) return this.cache.data;
                    return [];
                }
                throw fetchError;
            }
        } catch (e) {
            this.lastFailure = Date.now();
            logger.warn('[EconomicCalendar] Failed:', e.message);
            if (this.cache.data) {
                logger.info('[EconomicCalendar] Using cached data');
                return this.cache.data;
            }
            return [];
        }
    }

    async getUpcoming(withinMinutes = 60) {
        const events = await this.fetchEvents();
        const now = Date.now();
        const cutoff = now + withinMinutes * 60 * 1000;
        return events.filter(e => {
            const t = new Date(e.date).getTime();
            return t > now && t <= cutoff;
        });
    }

    async getSignal() {
        try {
            const upcoming = await this.getUpcoming(60);
            if (upcoming.length === 0) return { risk: 'normal', sizeMultiplier: 1, description: 'No upcoming events' };
            const highImpact = upcoming.filter(e => e.impact === 'High').length;
            const mediumImpact = upcoming.filter(e => e.impact === 'Medium').length;
            let risk = 'normal', sizeMultiplier = 1;
            if (highImpact > 0) {
                risk = 'high';
                sizeMultiplier = 0.3;
            } else if (mediumImpact > 1) {
                risk = 'medium';
                sizeMultiplier = 0.7;
            }
            const events = upcoming.map(e => e.title).join(', ');
            return { risk, sizeMultiplier, description: `Economic: ${risk} (${events})` };
        } catch (e) {
            return { risk: 'normal', sizeMultiplier: 1, description: 'Economic: fallback' };
        }
    }
}

module.exports = { EconomicCalendar };
