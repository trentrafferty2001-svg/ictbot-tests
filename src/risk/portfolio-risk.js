// src/risk/portfolio-risk.js
const logger = require('../logger');

class PortfolioRiskManager {
    constructor() {
        this.state = {
            totalExposure: 0,
            maxExposure: 0.05, // 5% of equity
            positions: [],
            correlationMatrix: {},
            drawdown: 0,
            peakEquity: 0
        };
        this.history = [];
    }

    update(equity, positions) {
        this.state.peakEquity = Math.max(this.state.peakEquity, equity);
        this.state.drawdown = this.state.peakEquity > 0 ? (this.state.peakEquity - equity) / this.state.peakEquity : 0;
        this.state.positions = positions;
        this.state.totalExposure = positions.reduce((s, p) => s + Math.abs(p.volume || 0), 0);
        // Update history
        this.history.push({ equity, positions: positions.length, exposure: this.state.totalExposure, timestamp: Date.now() });
        if (this.history.length > 100) this.history.shift();
    }

    // Correlation-adjusted position sizing
    getCorrelation(symbol1, symbol2) {
        // Use existing correlation data
        return this.state.correlationMatrix[`${symbol1}-${symbol2}`] || 0.5;
    }

    computeAdjustedSize(proposedSize, symbol, existingPositions) {
        let totalCorrelation = 0;
        for (const pos of existingPositions) {
            if (pos.symbol === symbol) continue;
            const corr = this.getCorrelation(symbol, pos.symbol);
            totalCorrelation += corr * Math.abs(pos.volume || 0);
        }
        const avgCorr = totalCorrelation / (existingPositions.length + 1);
        const factor = 1 / (1 + avgCorr * 0.5);
        return proposedSize * Math.max(0.3, Math.min(1.5, factor));
    }

    // Check if new trade would exceed max exposure
    canAddTrade(size, equity) {
        const newExposure = this.state.totalExposure + size;
        const maxAllowed = equity * this.state.maxExposure;
        if (newExposure > maxAllowed) {
            return { allowed: false, reason: `Exposure ${newExposure.toFixed(2)} > ${maxAllowed.toFixed(2)}` };
        }
        if (this.state.drawdown > 0.1) {
            return { allowed: false, reason: `Drawdown ${(this.state.drawdown*100).toFixed(1)}% > 10%` };
        }
        return { allowed: true, reason: 'OK' };
    }

    getRiskMultiplier(equity) {
        let mult = 1;
        if (this.state.drawdown > 0.08) mult *= 0.6;
        if (this.state.drawdown > 0.15) mult *= 0.3;
        if (this.state.drawdown > 0.25) mult *= 0.1;
        // Increase when winning
        const recent = this.history.slice(-20);
        const wins = recent.filter(h => h.equity > (this.history[this.history.length-21]?.equity || 0)).length;
        if (wins > 12 && this.state.drawdown < 0.05) mult *= 1.1;
        return Math.min(2, Math.max(0.1, mult));
    }

    getRecommendation(equity) {
        return {
            drawdown: this.state.drawdown,
            totalExposure: this.state.totalExposure,
            maxExposure: equity * this.state.maxExposure,
            riskMultiplier: this.getRiskMultiplier(equity),
            canAdd: this.state.drawdown < 0.1 && this.state.totalExposure < equity * this.state.maxExposure,
            description: `Portfolio: DD ${(this.state.drawdown*100).toFixed(1)}%, Exposure ${this.state.totalExposure.toFixed(2)}/${(equity*this.state.maxExposure).toFixed(2)}`
        };
    }
}

module.exports = { PortfolioRiskManager };
