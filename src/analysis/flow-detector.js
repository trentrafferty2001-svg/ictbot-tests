// src/analysis/flow-detector.js
const logger = require('../logger');

class FlowDetector {
    constructor() {
        this.trades = [];
        this.maxTrades = 1000;
    }

    // Feed tick-by-tick trades: { price, volume, timestamp, side: 'buy'|'sell' }
    addTrade(trade) {
        this.trades.push(trade);
        if (this.trades.length > this.maxTrades) this.trades.shift();
    }

    // Classify trade sizes: small (retail), medium, large (institutional)
    _classifySize(volume) {
        // These thresholds depend on the instrument – adjust for gold (lots)
        if (volume < 0.05) return 'small';
        if (volume < 0.2) return 'medium';
        return 'large';
    }

    analyze() {
        if (this.trades.length < 20) return { signal: 'neutral', confidence: 0.5, description: 'Insufficient trades' };
        const recent = this.trades.slice(-50);
        const sizes = recent.map(t => this._classifySize(t.volume));
        const largeTrades = recent.filter(t => this._classifySize(t.volume) === 'large');
        const largeBuy = largeTrades.filter(t => t.side === 'buy').length;
        const largeSell = largeTrades.filter(t => t.side === 'sell').length;
        const totalLarge = largeBuy + largeSell;
        if (totalLarge < 3) return { signal: 'neutral', confidence: 0.5, description: 'Not enough large trades' };
        const ratio = largeBuy / totalLarge;
        let signal = 'neutral', confidence = 0.5;
        if (ratio > 0.7) { signal = 'bullish'; confidence = 0.7; }
        else if (ratio < 0.3) { signal = 'bearish'; confidence = 0.7; }
        else if (ratio > 0.6) { signal = 'bullish'; confidence = 0.6; }
        else if (ratio < 0.4) { signal = 'bearish'; confidence = 0.6; }
        return {
            signal,
            confidence,
            largeBuy,
            largeSell,
            totalLarge,
            ratio,
            description: `Flow: ${signal} (${(ratio*100).toFixed(0)}% large buys)`
        };
    }

    getRecommendation() {
        const result = this.analyze();
        return result;
    }
}

module.exports = { FlowDetector };
