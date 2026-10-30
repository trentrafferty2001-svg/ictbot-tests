// src/analysis/options-positioning.js
const logger = require('../logger');
const { safeYahooFetch } = require('../utils/safe-fetch');

class OptionsPositioning {
    constructor() {
        this.cache = { data: null, timestamp: 0 };
        this.TTL = 2 * 60 * 60 * 1000; // 2 hours
    }

    async getData() {
        const now = Date.now();
        if (this.cache.data && now - this.cache.timestamp < this.TTL) return this.cache.data;
        try {
            const putCall = await this._fetchPutCall();
            const vix = await this._fetchVIX();
            const result = { putCall, vix, timestamp: now };
            this.cache.data = result;
            this.cache.timestamp = now;
            return result;
        } catch (e) {
            logger.warn('[OptionsPositioning] Failed:', e.message);
            return this.cache.data || null;
        }
    }

    async _fetchPutCall() {
        // Dummy – replace with real data if available
        return { ratio: 0.7, putVolume: 1000, callVolume: 1400 };
    }

    async _fetchVIX() {
        try {
            const url = 'https://query1.finance.yahoo.com/v8/finance/chart/^VIX?interval=1d&range=1d';
            const data = await safeYahooFetch(url, 'OptionsPositioning:VIX');
            if (!data) throw new Error('No data');
            const result = data.chart.result[0];
            const quotes = result.indicators.quote[0];
            const closes = quotes.close.filter(c => c !== null);
            return closes[closes.length - 1] || 20;
        } catch (e) {
            logger.warn('[OptionsPositioning] Failed for VIX:', e.message);
            return 20;
        }
    }

    async getRecommendation() {
        const data = await this.getData();
        if (!data) return { signal: 'neutral', confidence: 0, description: 'No options data' };
        const pc = data.putCall?.ratio || 0.7;
        const vix = data.vix || 20;
        let score = 0;
        if (pc > 0.9) score += 0.3;
        else if (pc < 0.6) score -= 0.3;
        if (vix > 25) score += 0.3;
        else if (vix < 15) score -= 0.2;
        const signal = score > 0.3 ? 'bullish' : score < -0.3 ? 'bearish' : 'neutral';
        const confidence = Math.min(0.9, 0.5 + Math.abs(score));
        return {
            signal,
            confidence,
            putCall: pc,
            vix,
            description: `Options: ${signal} (P/C ${pc.toFixed(2)}, VIX ${vix.toFixed(0)})`
        };
    }
}

module.exports = { OptionsPositioning };
