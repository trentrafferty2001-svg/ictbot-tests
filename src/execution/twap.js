// src/execution/twap.js
const logger = require('../logger');

class TWAPExecutor {
    constructor(cfg) {
        this.cfg = cfg;
        this.state = { active: false, order: null, slices: [], currentSlice: 0 };
    }

    // order: { symbol, actionType, volume, price (optional) }
    // totalDuration: seconds, slices: number
    async execute(order, totalDuration = 60, slices = 6) {
        const sliceSize = order.volume / slices;
        const interval = (totalDuration / slices) * 1000;
        this.state.active = true;
        this.state.order = order;
        this.state.currentSlice = 0;
        const results = [];
        for (let i = 0; i < slices; i++) {
            if (!this.state.active) break;
            const sliceOrder = { ...order, volume: sliceSize };
            // Apply price drift (simulate market impact)
            const price = order.price || 0;
            const drift = (i / slices) * 0.001; // 0.1% drift
            sliceOrder.price = price * (1 + drift * (order.actionType.includes('BUY') ? 1 : -1));
            try {
                const result = await this._executeSlice(sliceOrder);
                results.push(result);
            } catch (e) {
                logger.warn(`[TWAP] Slice ${i} failed: ${e.message}`);
                results.push({ error: e.message });
            }
            this.state.currentSlice = i + 1;
            if (i < slices - 1) await this._sleep(interval);
        }
        this.state.active = false;
        return this._aggregate(results);
    }

    async _executeSlice(order) {
        // Use existing maPost
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
        logger.info('[TWAP] Execution stopped');
    }
}

module.exports = { TWAPExecutor };
