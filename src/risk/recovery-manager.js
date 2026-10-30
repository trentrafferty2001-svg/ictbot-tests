// src/risk/recovery-manager.js
const logger = require('../logger');

class RecoveryManager {
    constructor() {
        this.state = {
            mode: 'normal', // 'normal', 'conservative', 'recovery'
            recoveryStartEquity: 0,
            recoveryTarget: 0,
            step: 0,
            totalLoss: 0,
            consecLosses: 0
        };
        this.parameters = {
            normal: { minScore: 3, maxT: 12, riskPct: 1.5, rr: 1.5 },
            conservative: { minScore: 5, maxT: 6, riskPct: 0.8, rr: 1.8 },
            recovery: { minScore: 6, maxT: 4, riskPct: 0.5, rr: 2.0 }
        };
    }

    update(equity, startingEquity, outcome, pnl) {
        const drawdown = (startingEquity - equity) / startingEquity;
        this.state.totalLoss += pnl < 0 ? Math.abs(pnl) : 0;
        if (outcome === 'loss') {
            this.state.consecLosses++;
        } else {
            this.state.consecLosses = 0;
        }

        // Determine mode
        if (drawdown > 0.08) {
            this.state.mode = 'recovery';
            if (!this.state.recoveryStartEquity) {
                this.state.recoveryStartEquity = equity;
                this.state.recoveryTarget = startingEquity;
            }
        } else if (drawdown > 0.04) {
            this.state.mode = 'conservative';
            this.state.recoveryStartEquity = 0;
        } else {
            this.state.mode = 'normal';
            this.state.recoveryStartEquity = 0;
        }

        // Check recovery complete
        if (this.state.mode === 'recovery' && equity >= this.state.recoveryTarget) {
            this.state.mode = 'normal';
            this.state.recoveryStartEquity = 0;
            this.state.recoveryTarget = 0;
            logger.info('[Recovery] Recovery complete!');
        }

        // Gradual step recovery
        if (this.state.mode === 'recovery') {
            const progress = (equity - this.state.recoveryStartEquity) / (this.state.recoveryTarget - this.state.recoveryStartEquity);
            if (progress > 0.5) {
                this.state.mode = 'conservative';
            }
        }
    }

    getParameters() {
        return this.parameters[this.state.mode] || this.parameters.normal;
    }

    getRiskMultiplier() {
        const multipliers = { normal: 1, conservative: 0.6, recovery: 0.3 };
        return multipliers[this.state.mode] || 1;
    }

    getRecommendation() {
        return {
            mode: this.state.mode,
            parameters: this.getParameters(),
            riskMultiplier: this.getRiskMultiplier(),
            consecLosses: this.state.consecLosses,
            totalLoss: this.state.totalLoss,
            description: `Recovery: ${this.state.mode} mode (losses ${this.state.consecLosses})`
        };
    }
}

module.exports = { RecoveryManager };
