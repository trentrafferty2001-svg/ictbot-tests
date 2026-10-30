// src/analysis/intermarket-advanced.js
const logger = require('../logger');
const { safeYahooFetch } = require('../utils/safe-fetch');

class IntermarketAdvanced {
    constructor() {
        this.cache = { data: null, timestamp: 0 };
        this.TTL = 60 * 60 * 1000; // 1 hour
        this.symbols = [
            { name: 'DXY', symbol: 'DX-Y.NYB', weight: 0.3 },
            { name: 'TLT', symbol: 'TLT', weight: 0.15 },
            { name: 'SPY', symbol: 'SPY', weight: 0.15 },
            { name: 'GDX', symbol: 'GDX', weight: 0.2 },
            { name: 'USO', symbol: 'USO', weight: 0.1 },
            { name: 'EEM', symbol: 'EEM', weight: 0.1 }
        ];
    }

    async fetchYahoo(symbol) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
        try {
            // Use safeYahooFetch with a unique key
            const data = await safeYahooFetch(url, `IntermarketAdvanced:${symbol}`);
            if (!data) throw new Error('No data');
            const result = data.chart.result[0];
            if (!result) throw new Error('No result');
            const quotes = result.indicators.quote[0];
            const closes = quotes.close.filter(c => c !== null);
            const last = closes[closes.length - 1] || 0;
            const prev = closes.length > 1 ? closes[closes.length - 2] : last;
            const change = prev > 0 ? (last - prev) / prev * 100 : 0;
            return { price: last, change, prev };
        } catch (e) {
            logger.warn(`[IntermarketAdvanced] Failed for ${symbol}:`, e.message);
            return { price: 0, change: 0, prev: 0 };
        }
    }

    async getData() {
        const now = Date.now();
        if (this.cache.data && now - this.cache.timestamp < this.TTL) return this.cache.data;
        try {
            const results = {};
            for (const s of this.symbols) {
                results[s.name] = await this.fetchYahoo(s.symbol);
            }
            this.cache.data = results;
            this.cache.timestamp = now;
            return results;
        } catch (e) {
            logger.warn('[IntermarketAdvanced] Failed:', e.message);
            return this.cache.data || null;
        }
    }

    getScore(data) {
        if (!data) return { score: 0, bias: 'neutral', confidence: 0 };
        let score = 0;
        const signals = {
            DXY: data.DXY ? -Math.sign(data.DXY.change) : 0,
            TLT: data.TLT ? Math.sign(data.TLT.change) : 0,
            SPY: data.SPY ? Math.sign(data.SPY.change) : 0,
            GDX: data.GDX ? Math.sign(data.GDX.change) : 0,
            USO: data.USO ? Math.sign(data.USO.change) : 0,
            EEM: data.EEM ? Math.sign(data.EEM.change) : 0
        };
        for (const [key, val] of Object.entries(signals)) {
            const weight = this.symbols.find(s => s.name === key)?.weight || 0.1;
            score += val * weight;
        }
        const bias = score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral';
        const confidence = Math.min(0.9, 0.5 + Math.abs(score) * 1.5);
        return { score, bias, confidence, signals };
    }

    async getRecommendation() {
        const data = await this.getData();
        const result = this.getScore(data);
        return {
            ...result,
            description: `Intermarket: ${result.bias} (score ${result.score.toFixed(2)})`
        };
    }
}

module.exports = { IntermarketAdvanced };
