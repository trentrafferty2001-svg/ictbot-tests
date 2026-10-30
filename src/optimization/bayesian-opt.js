// src/optimization/bayesian-opt.js
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

class BayesianOptimizer {
    constructor() {
        this.file = path.join('/tmp', 'bayesian_opt.json');
        this.params = {
            minScore: { min: 2, max: 6, current: 3 },
            riskPct: { min: 0.5, max: 3, current: 1.5 },
            rr: { min: 1, max: 3, current: 1.5 },
            trailActivation: { min: 0.05, max: 0.5, current: 0.2 },
            beThreshold: { min: 0.02, max: 0.3, current: 0.1 }
        };
        this.trials = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.file)) {
                const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                this.params = data.params || this.params;
                this.trials = data.trials || [];
            }
        } catch (e) {}
    }

    save() {
        try {
            fs.writeFileSync(this.file, JSON.stringify({ params: this.params, trials: this.trials }, null, 2));
        } catch (e) {}
    }

    // Record a trial with its performance
    recordTrial(params, metric) {
        this.trials.push({ params: { ...params }, metric, timestamp: Date.now() });
        if (this.trials.length > 50) this.trials.shift();
        this.save();
    }

    // Suggest next parameter set using a simple Gaussian Process approximation
    suggest() {
        if (this.trials.length < 3) {
            // Random exploration
            const result = {};
            for (const [key, p] of Object.entries(this.params)) {
                const range = p.max - p.min;
                result[key] = p.min + Math.random() * range;
            }
            return result;
        }
        // Simple: find best trial and perturb around it
        const best = this.trials.reduce((a, b) => a.metric > b.metric ? a : b);
        const result = {};
        for (const [key, p] of Object.entries(this.params)) {
            const range = p.max - p.min;
            const current = best.params[key] || p.current;
            const perturb = (Math.random() - 0.5) * range * 0.2;
            result[key] = Math.max(p.min, Math.min(p.max, current + perturb));
        }
        return result;
    }

    // Update current best
    updateBest() {
        if (this.trials.length === 0) return;
        const best = this.trials.reduce((a, b) => a.metric > b.metric ? a : b);
        for (const [key, value] of Object.entries(best.params)) {
            if (this.params[key]) this.params[key].current = value;
        }
        this.save();
        logger.info(`[BayesianOpt] Best params updated: ${JSON.stringify(best.params)}`);
    }

    getRecommendation() {
        const suggested = this.suggest();
        return {
            params: suggested,
            bestParams: Object.fromEntries(Object.entries(this.params).map(([k, v]) => [k, v.current])),
            trials: this.trials.length,
            description: `BayesianOpt: ${this.trials.length} trials`
        };
    }
}

module.exports = { BayesianOptimizer };
