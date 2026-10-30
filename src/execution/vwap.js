// src/execution/vwap.js
const logger = require('../logger');

class VWAPExecutor {
    constructor(cfg) {
        this.cfg = cfg;
        this.state = { active: false, order: null, slices: [], currentSlice: 0 };
    }

    // order: { symbol, actionType, volume }
    // totalDuration: seconds, slices: number
    async execute(order, totalDuration = 60, slices = 6) {
        const sliceSize = order.volume / slices;
        const interval = (totalDuration / slices) * 1000;
        this.state.active = true;
        this.state.order = order;
        this.state.currentSlice = 0;
        const results = [];
        const marketPrices = [];
        // Pre-fetch market prices to calculate VWAP
        for (let i = 0; i < slices; i++) {
            try {
                const sym = await resolveSymbol(this.cfg);
                const pd = await maGet(this.cfg, '/symbols/' + encodeURIComponent(sym) + '/current-price', false);
                const price = order.actionType.includes('BUY') ? parseFloat(pd.ask) : parseFloat(pd.bid);
                marketPrices.push(price);
            } catch (e) {
                marketPrices.push(0);
            }
            if (i < slices - 1) await this._sleep(interval);
        }
        const vwap = marketPrices.filter(p => p > 0).reduce((a, b) => a + b, 0) / (marketPrices.filter(p => p > 0).length || 1);
        // Execute slices at VWAP
        for (let i = 0; i < slices; i++) {
            if (!this.state.active) break;
            const sliceOrder = { ...order, volume: sliceSize, price: vwap };
            try {
                const result = await this._executeSlice(sliceOrder);
                results.push(result);
            } catch (e) {
                logger.warn(`[VWAP] Slice ${i} failed: ${e.message}`);
                results.push({ error: e.message });
            }
            this.state.currentSlice = i + 1;
            if (i < slices - 1) await this._sleep(interval);
        }
        this.state.active = false;
        return this._aggregate(results);
    }

    async _executeSlice(order) {
        return await maPost(this.cfg, '/trade', order);
    }

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    _aggregate(results) {
        const successful = results.filter(r => !r.error);
        const filled = successful.reduce((s, r) => s + parseFloat(r.volume || 0), 0);
        const avgPrice = filled > 0 ? successful.reduce((s, r) => s + parseFloat(r.price || 0) * parseFloat(r.volume || 0), 0) / filled : 0;
        return { filled, avgPrice, slices: successful.length, totalSlices: results.length, results };
    }

    stop() {
        this.state.active = false;
        logger.info('[VWAP] Execution stopped');
    }
}

module.exports = { VWAPExecutor };
