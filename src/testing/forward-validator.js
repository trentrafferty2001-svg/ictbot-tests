// src/testing/forward-validator.js
const logger = require('../logger');

class ForwardValidator {
    constructor() {
        this.history = [];
        this.window = 20;
        this.threshold = 0.05; // 5% deviation
    }

    // Record trade prediction vs actual outcome
    record(predictedProb, actualOutcome, pnl) {
        this.history.push({
            predicted: predictedProb,
            outcome: actualOutcome,
            pnl,
            timestamp: Date.now()
        });
        if (this.history.length > 200) this.history.shift();
    }

    validate() {
        if (this.history.length < this.window) return { valid: true, reason: 'Insufficient data' };
        const recent = this.history.slice(-this.window);
        const avgPred = recent.reduce((s, h) => s + h.predicted, 0) / recent.length;
        const actualWR = recent.filter(h => h.outcome === 'win').length / recent.length;
        const deviation = Math.abs(avgPred - actualWR);
        const valid = deviation < this.threshold;
        if (!valid) {
            logger.warn(`[ForwardValidator] Deviation ${(deviation*100).toFixed(1)}% > ${(this.threshold*100).toFixed(0)}%`);
        }
        return {
            valid,
            avgPred,
            actualWR,
            deviation,
            samples: recent.length,
            threshold: this.threshold,
            reason: valid ? 'OK' : `Prediction vs actual deviates by ${(deviation*100).toFixed(1)}%`
        };
    }

    getRecommendation() {
        const result = this.validate();
        if (!result.valid && result.samples >= this.window) {
            return { action: 'reduce_size', sizeMultiplier: 0.5, reason: result.reason };
        }
        if (!result.valid && result.samples >= this.window * 2) {
            return { action: 'pause', reason: 'Forward validation failed repeatedly' };
        }
        return { action: 'normal', sizeMultiplier: 1, reason: 'OK' };
    }
}

module.exports = { ForwardValidator };
