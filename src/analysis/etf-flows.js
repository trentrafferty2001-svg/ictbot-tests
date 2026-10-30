// src/analysis/etf-flows.js
const logger = require('../logger');
const { safeYahooFetch } = require('../utils/safe-fetch');

class ETFFlows {
    constructor() {
        this.cache = { data: null, timestamp: 0 };
        this.TTL = 2 * 60 * 60 * 1000; // 2 hours
    }

    async fetchETFData() {
        const now = Date.now();
        if (this.cache.data && now - this.cache.timestamp < this.TTL) return this.cache.data;
        try {
            const symbols = ['GLD', 'IAU', 'GDX'];
            const results = {};
            for (const sym of symbols) {
                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
                try {
                    const data = await safeYahooFetch(url, `ETFFlows:${sym}`);
                    if (!data) continue;
                    const result = data.chart.result[0];
                    if (!result) continue;
                    const quotes = result.indicators.quote[0];
                    const closes = quotes.close.filter(c => c !== null);
                    const volumes = quotes.volume.filter(v => v !== null);
                    const lastClose = closes[closes.length - 1] || 0;
                    const prevClose = closes.length > 1 ? closes[closes.length - 2] : lastClose;
                    const lastVolume = volumes[volumes.length - 1] || 0;
                    const avgVolume = volumes.slice(-10).reduce((a, b) => a + b, 0) / (volumes.length || 1);
                    results[sym] = {
                        price: lastClose,
                        change: prevClose > 0 ? (lastClose - prevClose) / prevClose * 100 : 0,
                        volume: lastVolume,
                        volumeRatio: avgVolume > 0 ? lastVolume / avgVolume : 1
                    };
                } catch (e) {
                    logger.warn(`[ETFFlows] Failed for ${sym}:`, e.message);
                }
            }
            this.cache.data = results;
            this.cache.timestamp = now;
            return results;
        } catch (e) {
            logger.warn('[ETFFlows] Failed:', e.message);
            return this.cache.data || null;
        }
    }

    async getRecommendation() {
        const data = await this.fetchETFData();
        if (!data) return { signal: 'neutral', confidence: 0, description: 'No ETF data' };
        const gld = data.GLD;
        const gdx = data.GDX;
        let score = 0;
        if (gld) {
            if (gld.change > 0.5) score += 0.3;
            if (gld.change < -0.5) score -= 0.3;
            if (gld.volumeRatio > 1.5 && gld.change > 0) score += 0.3;
            if (gld.volumeRatio > 1.5 && gld.change < 0) score -= 0.3;
        }
        if (gdx) {
            if (gdx.change > 0.5) score += 0.2;
            if (gdx.change < -0.5) score -= 0.2;
        }
        const signal = score > 0.3 ? 'bullish' : score < -0.3 ? 'bearish' : 'neutral';
        const confidence = Math.min(0.9, 0.5 + Math.abs(score));
        return { signal, confidence, score, description: `ETF Flows: ${signal} (${score.toFixed(2)})` };
    }
}

module.exports = { ETFFlows };
