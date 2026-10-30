// src/optimization/rl-params.js
const logger = require('../logger');

class RLParamOptimizer {
    constructor() {
        this.state = {
            riskPct: 1.5,
            minScore: 3,
            rr: 1.5,
            trailActivation: 0.2,
            beThreshold: 0.1,
            maxT: 12
        };
        this.history = [];
        this.epsilon = 0.3;
        this.learningRate = 0.1;
        this.discount = 0.95;
        this.Q = {};
    }

    // State = (winRate, drawdown, volatility)
    _getState(recentTrades) {
        const closed = recentTrades.filter(t => t.outcome !== null);
        if (closed.length < 10) return 'default';
        const wins = closed.filter(t => t.outcome === 'win').length;
        const wr = wins / closed.length;
        const avgPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0) / closed.length;
        const dd = Math.max(0, -avgPnl * 0.1);
        const wrBin = wr > 0.55 ? 'high' : wr > 0.45 ? 'mid' : 'low';
        const ddBin = dd > 2 ? 'high' : dd > 0.5 ? 'mid' : 'low';
        return `${wrBin}_${ddBin}`;
    }

    _getActions() {
        return [
            { riskPct: 1.0, minScore: 4, rr: 1.2, trailActivation: 0.15, beThreshold: 0.08, maxT: 8 },
            { riskPct: 1.5, minScore: 3, rr: 1.5, trailActivation: 0.2, beThreshold: 0.1, maxT: 12 },
            { riskPct: 2.0, minScore: 2, rr: 2.0, trailActivation: 0.3, beThreshold: 0.15, maxT: 15 },
            { riskPct: 1.2, minScore: 4, rr: 1.8, trailActivation: 0.25, beThreshold: 0.12, maxT: 10 },
            { riskPct: 1.8, minScore: 2, rr: 1.3, trailActivation: 0.18, beThreshold: 0.09, maxT: 14 }
        ];
    }

    update(outcome, pnl, trades) {
        const state = this._getState(trades);
        const actions = this._getActions();
        const reward = outcome === 'win' ? Math.min(1, pnl / 10) : Math.min(-1, pnl / 10);
        // Update Q
        if (!this.Q[state]) {
            this.Q[state] = actions.map(() => 0);
        }
        const bestAction = this._selectAction(state, actions);
        const oldQ = this.Q[state][bestAction] || 0;
        this.Q[state][bestAction] = oldQ + this.learningRate * (reward + this.discount * Math.max(...(this.Q[state] || [0])) - oldQ);
        // Apply best action with epsilon-greedy
        if (Math.random() > this.epsilon) {
            const action = actions[bestAction];
            Object.assign(this.state, action);
        }
        this.history.push({ state, action: bestAction, reward });
        if (this.history.length > 100) this.history.shift();
        logger.debug(`[RL] State: ${state}, Action: ${bestAction}, Reward: ${reward.toFixed(2)}`);
    }

    _selectAction(state, actions) {
        if (!this.Q[state]) {
            this.Q[state] = actions.map(() => 0);
        }
        const maxVal = Math.max(...this.Q[state]);
        const maxIndices = this.Q[state].map((v, i) => v === maxVal ? i : -1).filter(i => i >= 0);
        return maxIndices.length > 0 ? maxIndices[Math.floor(Math.random() * maxIndices.length)] : Math.floor(Math.random() * actions.length);
    }

    getParameters() {
        return { ...this.state };
    }

    getRecommendation() {
        return {
            params: this.getParameters(),
            description: `RL: risk=${this.state.riskPct}%, minScore=${this.state.minScore}, RR=${this.state.rr}`
        };
    }
}

module.exports = { RLParamOptimizer };
