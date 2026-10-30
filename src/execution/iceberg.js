// src/execution/iceberg.js
const logger = require('../logger');

class IcebergExecutor {
    constructor(cfg) {
        this.cfg = cfg;
        this.state = { active: false, order: null, displayedSize: 0, totalFilled: 0 };
    }

    // order: { symbol, actionType, volume, price }
    // displaySize: amount to show at a time
    // refreshInterval: ms between refreshing
    async execute(order, displaySize = 0.2, refreshInterval = 3000) {
        this.state.active = true;
        this.state.order = order;
        this.state.displayedSize = Math.min(displaySize, order.volume);
        this.state.totalFilled = 0;
        const results = [];
        let remaining = order.volume;
        while (remaining > 0 && this.state.active) {
            const slice = Math.min(this.state.displayedSize, remaining);
            const sliceOrder = { ...order, volume: slice };
            try {
                const result = await this._executeSlice(sliceOrder);
                const filled = parseFloat(result.volume || 0);
                this.state.totalFilled += filled;
                remaining -= filled;
                results.push(result);
                if (remaining > 0) {
                    // Refresh: cancel and re-enter with new displayed size
                    await this._refreshOrder();
                }
            } catch (e) {
                logger.warn(`[Iceberg] Slice failed: ${e.message}`);
                results.push({ error: e.message });
                break;
            }
            if (remaining > 0) await this._sleep(refreshInterval);
        }
        this.state.active = false;
        return { filled: this.state.totalFilled, slices: results.length, results };
    }

    async _executeSlice(order) {
        return await maPost(this.cfg, '/trade', order);
    }

    async _refreshOrder() {
        // In practice, you'd cancel the existing limit order and place a new one
        // This is a simplified version
        await this._sleep(100);
    }

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    stop() {
        this.state.active = false;
        logger.info('[Iceberg] Execution stopped');
    }
}

module.exports = { IcebergExecutor };
