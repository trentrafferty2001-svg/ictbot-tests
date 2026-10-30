// src/analysis/order-book.js
const logger = require('../logger');

class OrderBookAnalyzer {
    constructor() {
        this.lastBook = null;
        this.cache = { bids: [], asks: [], timestamp: 0 };
        this.TTL = 1000; // 1 second
    }

    // Call this with live order book data from broker
    updateBook(bids, asks) {
        this.cache.bids = bids || [];
        this.cache.asks = asks || [];
        this.cache.timestamp = Date.now();
        this.lastBook = { bids, asks };
    }

    getBook() {
        if (Date.now() - this.cache.timestamp > this.TTL) {
            return null; // stale
        }
        return { bids: this.cache.bids, asks: this.cache.asks };
    }

    // Detect large pending orders (walls)
    detectWalls(bids, asks, threshold = 100) {
        const result = { buyWalls: [], sellWalls: [] };
        if (!bids || !asks) return result;
        // Group by price levels (10% tolerance)
        const groupedBids = this._groupByPrice(bids, 0.001);
        const groupedAsks = this._groupByPrice(asks, 0.001);
        for (const [price, volume] of Object.entries(groupedBids)) {
            if (volume > threshold) result.buyWalls.push({ price: parseFloat(price), volume });
        }
        for (const [price, volume] of Object.entries(groupedAsks)) {
            if (volume > threshold) result.sellWalls.push({ price: parseFloat(price), volume });
        }
        return result;
    }

    _groupByPrice(orders, tolerance) {
        const groups = {};
        for (const o of orders) {
            const price = o.price || o;
            const volume = o.volume || o.volume || 1;
            const key = Math.round(price / tolerance) * tolerance;
            if (!groups[key]) groups[key] = 0;
            groups[key] += volume;
        }
        return groups;
    }

    // Detect absorption – price not moving despite large volume
    detectAbsorption(currentPrice, book) {
        if (!book || !book.bids || !book.asks) return { absorption: false, side: null };
        const nearBidVolume = book.bids.filter(b => b.price > currentPrice * 0.99).reduce((s, b) => s + b.volume, 0);
        const nearAskVolume = book.asks.filter(b => b.price < currentPrice * 1.01).reduce((s, b) => s + b.volume, 0);
        const ratio = nearBidVolume / (nearAskVolume + 1);
        if (ratio > 3) return { absorption: true, side: 'buy' };
        if (ratio < 0.33) return { absorption: true, side: 'sell' };
        return { absorption: false, side: null };
    }

    getRecommendation(price) {
        const book = this.getBook();
        if (!book) return { action: 'neutral', confidence: 0, description: 'No book data' };
        const walls = this.detectWalls(book.bids, book.asks);
        const absorption = this.detectAbsorption(price, book);
        let action = 'neutral', confidence = 0.5;
        if (walls.buyWalls.length > walls.sellWalls.length && absorption.side === 'buy') {
            action = 'bullish';
            confidence = 0.7;
        } else if (walls.sellWalls.length > walls.buyWalls.length && absorption.side === 'sell') {
            action = 'bearish';
            confidence = 0.7;
        } else if (walls.buyWalls.length > walls.sellWalls.length) {
            action = 'bullish';
            confidence = 0.6;
        } else if (walls.sellWalls.length > walls.buyWalls.length) {
            action = 'bearish';
            confidence = 0.6;
        }
        return { action, confidence, walls, absorption, description: `Order book: ${action} (${confidence.toFixed(2)})` };
    }
}

module.exports = { OrderBookAnalyzer };
