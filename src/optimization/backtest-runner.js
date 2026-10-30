// src/optimization/backtest-runner.js
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

class BacktestRunner {
    constructor() {
        this.results = [];
        this.file = path.join('/tmp', 'backtest_results.json');
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.file)) {
                this.results = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            }
        } catch (e) {}
        if (!Array.isArray(this.results)) this.results = [];
    }

    save() {
        try {
            fs.writeFileSync(this.file, JSON.stringify(this.results.slice(-50), null, 2));
        } catch (e) {}
    }

    // Run backtest on historical data with given parameters
    runBacktest(candles, params) {
        // Simplified – in production, this would be a full simulation
        const { minScore, riskPct, rr, trailActivation } = params;
        let trades = [];
        let equity = 10000;
        let peak = 10000;
        let drawdowns = [];
        // Simulate simple logic
        const closes = candles.map(c => c.close);
        for (let i = 20; i < closes.length - 1; i++) {
            // Simple dummy logic
            const signal = closes[i] > closes[i-5] ? 'buy' : closes[i] < closes[i-5] ? 'sell' : 'none';
            if (signal !== 'none' && Math.random() > 0.3) {
                const entry = closes[i];
                const sl = signal === 'buy' ? entry * 0.995 : entry * 1.005;
                const tp = signal === 'buy' ? entry * (1 + rr * 0.005) : entry * (1 - rr * 0.005);
                const exit = closes[i+1];
                let pnl = signal === 'buy' ? (exit - entry) / entry * 100 : (entry - exit) / entry * 100;
                pnl *= 100; // scale
                equity += pnl;
                peak = Math.max(peak, equity);
                trades.push({ entry, exit, pnl, outcome: pnl > 0 ? 'win' : 'loss' });
                drawdowns.push((peak - equity) / peak);
            }
        }
        const wins = trades.filter(t => t.outcome === 'win').length;
        const wr = trades.length > 0 ? wins / trades.length : 0;
        const avgPnl = trades.reduce((s, t) => s + t.pnl, 0) / (trades.length || 1);
        const maxDD = drawdowns.length > 0 ? Math.max(...drawdowns) : 0;
        const result = {
            params,
            trades: trades.length,
            winRate: wr,
            avgPnl,
            totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
            maxDrawdown: maxDD,
            sharpe: avgPnl / (trades.map(t => Math.abs(t.pnl)).reduce((s, v) => s + v, 0) / (trades.length || 1) || 1),
            timestamp: Date.now()
        };
        this.results.push(result);
        this.save();
        return result;
    }

    // Compare last N backtests
    compare(limit = 10) {
        const recent = this.results.slice(-limit);
        if (recent.length < 2) return { message: 'Need more backtests' };
        const best = recent.reduce((a, b) => a.sharpe > b.sharpe ? a : b);
        const worst = recent.reduce((a, b) => a.sharpe < b.sharpe ? a : b);
        return {
            best,
            worst,
            average: recent.reduce((s, r) => s + r.winRate, 0) / recent.length,
            description: `Backtest: ${recent.length} runs, best Sharpe ${best.sharpe?.toFixed(2)}`
        };
    }

    getRecommendation() {
        if (this.results.length < 2) return { action: 'explore', description: 'Not enough backtests' };
        const best = this.results.reduce((a, b) => a.sharpe > b.sharpe ? a : b);
        return {
            action: 'use_best',
            params: best.params,
            performance: { winRate: best.winRate, sharpe: best.sharpe },
            description: `Backtest: best Sharpe ${best.sharpe?.toFixed(2)} from ${best.trades} trades`
        };
    }
}

module.exports = { BacktestRunner };
