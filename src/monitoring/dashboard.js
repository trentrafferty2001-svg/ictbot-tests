// src/monitoring/dashboard.js
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

class Dashboard {
    constructor() {
        this.metrics = {
            equity: [],
            trades: [],
            winRate: 0,
            dailyPnl: [],
            monthlyPnl: [],
            sharpe: 0,
            maxDrawdown: 0,
            currentDrawdown: 0,
            totalTrades: 0,
            wins: 0,
            losses: 0,
            avgWin: 0,
            avgLoss: 0,
            profitFactor: 0,
            lastUpdate: 0
        };
        this.file = path.join('/tmp', 'dashboard_metrics.json');
        this.load();
        this.alerts = [];
    }

    load() {
        try {
            if (fs.existsSync(this.file)) {
                const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                Object.assign(this.metrics, data);
            }
        } catch (e) {}
    }

    save() {
        try {
            fs.writeFileSync(this.file, JSON.stringify(this.metrics, null, 2));
        } catch (e) {}
    }

    // Record a trade outcome
    recordTrade(outcome, pnl, equity) {
        this.metrics.trades.push({ outcome, pnl, equity, timestamp: Date.now() });
        if (this.metrics.trades.length > 1000) this.metrics.trades.shift();
        this.metrics.totalTrades++;
        if (outcome === 'win') this.metrics.wins++;
        else this.metrics.losses++;
        this.metrics.winRate = this.metrics.totalTrades > 0 ? this.metrics.wins / this.metrics.totalTrades : 0;
        this.metrics.equity.push({ equity, timestamp: Date.now() });
        if (this.metrics.equity.length > 1000) this.metrics.equity.shift();
        // Calculate P&L aggregates
        const wins = this.metrics.trades.filter(t => t.outcome === 'win');
        const losses = this.metrics.trades.filter(t => t.outcome === 'loss');
        this.metrics.avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
        this.metrics.avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
        this.metrics.profitFactor = Math.abs(this.metrics.avgLoss) > 0 ? this.metrics.avgWin / Math.abs(this.metrics.avgLoss) : 0;
        // Drawdown
        const equityValues = this.metrics.equity.map(e => e.equity);
        if (equityValues.length > 0) {
            const peak = Math.max(...equityValues);
            const current = equityValues[equityValues.length - 1];
            this.metrics.currentDrawdown = peak > 0 ? (peak - current) / peak : 0;
            this.metrics.maxDrawdown = Math.max(this.metrics.maxDrawdown, this.metrics.currentDrawdown);
        }
        // Sharpe (simplified)
        const pnls = this.metrics.trades.map(t => t.pnl);
        if (pnls.length > 1) {
            const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
            const std = Math.sqrt(pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length);
            this.metrics.sharpe = std > 0 ? mean / std * Math.sqrt(252) : 0;
        }
        // Daily PNL
        const today = new Date().toISOString().split('T')[0];
        if (this.metrics.dailyPnl.length > 30) this.metrics.dailyPnl.shift();
        const dayPnl = this.metrics.dailyPnl.find(d => d.date === today);
        if (dayPnl) dayPnl.pnl += pnl;
        else this.metrics.dailyPnl.push({ date: today, pnl });
        this.metrics.lastUpdate = Date.now();
        this.save();
        this._checkAlerts();
    }

    _checkAlerts() {
        const alerts = [];
        if (this.metrics.winRate < 0.35 && this.metrics.totalTrades > 20) {
            alerts.push({ level: 'warning', message: `Low win rate: ${(this.metrics.winRate*100).toFixed(1)}%` });
        }
        if (this.metrics.currentDrawdown > 0.1) {
            alerts.push({ level: 'danger', message: `High drawdown: ${(this.metrics.currentDrawdown*100).toFixed(1)}%` });
        }
        if (this.metrics.sharpe < 0.5 && this.metrics.totalTrades > 20) {
            alerts.push({ level: 'warning', message: `Low Sharpe: ${this.metrics.sharpe.toFixed(2)}` });
        }
        if (this.metrics.profitFactor < 1 && this.metrics.totalTrades > 20) {
            alerts.push({ level: 'warning', message: `Profit Factor < 1: ${this.metrics.profitFactor.toFixed(2)}` });
        }
        if (alerts.length > 0 && JSON.stringify(alerts) !== JSON.stringify(this.alerts)) {
            this.alerts = alerts;
            for (const a of alerts) {
                logger.warn(`[Dashboard Alert] ${a.level}: ${a.message}`);
            }
            // Trigger Telegram alert if configured
            try { sendTelegram(`⚠️ *Dashboard Alert* ${a.level}\n${a.message}`); } catch (e) {}
        }
    }

    getMetrics() {
        return { ...this.metrics, alerts: this.alerts };
    }

    getRecommendation() {
        const metrics = this.getMetrics();
        let action = 'normal';
        if (metrics.winRate < 0.35 && metrics.totalTrades > 20) action = 'caution';
        if (metrics.currentDrawdown > 0.1) action = 'reduce_risk';
        if (metrics.currentDrawdown > 0.2) action = 'pause';
        return {
            action,
            winRate: metrics.winRate,
            drawdown: metrics.currentDrawdown,
            sharpe: metrics.sharpe,
            profitFactor: metrics.profitFactor,
            alerts: metrics.alerts,
            description: `Dashboard: ${action} (WR ${(metrics.winRate*100).toFixed(1)}%, DD ${(metrics.currentDrawdown*100).toFixed(1)}%)`
        };
    }
}

module.exports = { Dashboard };
