// src/learning/enhanced-learner.js
// Enhanced Learning Module - Regime-aware, Online Updates, Dynamic TP/RR
const fs = require('fs');
const path = require('path');
const { logger } = require('../logger');

const STATE_FILE = path.join('/tmp', 'enhanced_learner_state.json');

class EnhancedLearner {
    constructor() {
        this.state = this.loadState();
        // Default structure if empty
        if (!this.state.regimes) {
            this.state.regimes = {
                trending: { factors: {}, entries: {}, tpStats: {}, trades: [], sharpe: 0, count: 0 },
                ranging: { factors: {}, entries: {}, tpStats: {}, trades: [], sharpe: 0, count: 0 },
                volatile: { factors: {}, entries: {}, tpStats: {}, trades: [], sharpe: 0, count: 0 },
                normal: { factors: {}, entries: {}, tpStats: {}, trades: [], sharpe: 0, count: 0 }
            };
            this.state.globalParams = { minScoreOffset: 0, riskMultiplier: 1.0, lastUpdate: Date.now() };
            this.saveState();
        }
        this.regimeMap = {
            'trending': 'trending',
            'strong_trend': 'trending',
            'ranging': 'ranging',
            'volatile': 'volatile',
            'high_volatility': 'volatile',
            'normal': 'normal'
        };
    }

    loadState() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            }
        } catch (e) { logger.warn('[EnhancedLearner] Load failed:', e.message); }
        return {};
    }

    saveState() {
        try { fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2)); } 
        catch (e) { logger.warn('[EnhancedLearner] Save failed:', e.message); }
    }

    // ─── CORE: Record a trade outcome ──────────────────────────────────────
    recordTrade(analysis, outcome, pnl, regime, tpLevels) {
        const regimeKey = this.regimeMap[regime] || 'normal';
        const reg = this.state.regimes[regimeKey];
        if (!reg) return;

        // 1. Update Factor Weights (Online Delta)
        const factors = analysis.factors || [];
        const hits = analysis.hits || [];
        const score = analysis.score || 0;
        const signal = analysis.signal || 'none';
        const entryType = analysis.entryType || 'market';
        const isWin = outcome === 'win';

        // Factor update: simple Bayesian incremental average
        factors.forEach(f => {
            if (!reg.factors[f]) reg.factors[f] = { wins: 0, losses: 0, totalPnl: 0, count: 0 };
            const stat = reg.factors[f];
            stat.count++;
            if (isWin) stat.wins++;
            else stat.losses++;
            stat.totalPnl += pnl;
        });

        // 2. Entry Type Contextual Bandit
        if (!reg.entries[entryType]) reg.entries[entryType] = { wins: 0, losses: 0, totalPnl: 0, count: 0 };
        const eStat = reg.entries[entryType];
        eStat.count++;
        if (isWin) eStat.wins++;
        else eStat.losses++;
        eStat.totalPnl += pnl;

        // 3. TP Level Performance (if split)
        if (tpLevels && tpLevels.length) {
            // tpLevels is an array of { level: 1|2|3, pnl: number, hit: boolean }
            tpLevels.forEach(tp => {
                const key = `tp${tp.level}`;
                if (!reg.tpStats[key]) reg.tpStats[key] = { hits: 0, misses: 0, totalPnl: 0, count: 0 };
                const tpStat = reg.tpStats[key];
                tpStat.count++;
                tpStat.totalPnl += tp.pnl;
                if (tp.hit) tpStat.hits++;
                else tpStat.misses++;
            });
        }

        // 4. Sliding Window Sharpe (last 50 trades)
        reg.trades.push({ outcome: isWin ? 1 : -1, pnl, ts: Date.now() });
        if (reg.trades.length > 100) reg.trades = reg.trades.slice(-100);
        
        const recent = reg.trades.slice(-30);
        if (recent.length >= 10) {
            const avgPnl = recent.reduce((s, t) => s + t.pnl, 0) / recent.length;
            const variance = recent.reduce((s, t) => s + Math.pow(t.pnl - avgPnl, 2), 0) / recent.length;
            const stdDev = Math.sqrt(variance + 0.0001);
            reg.sharpe = (avgPnl / stdDev) * Math.sqrt(365); // Annualized approximation
        }

        // 5. Global Parameter Tuning (Risk/Score offset)
        this.tuneGlobalParams(regimeKey);

        this.saveState();
        logger.info(`[EnhancedLearner] Recorded ${outcome} trade for regime ${regimeKey}. Sharpe: ${reg.sharpe.toFixed(2)}`);
    }

    // ─── TUNE GLOBAL PARAMS (Online) ──────────────────────────────────────
    tuneGlobalParams(regimeKey) {
        const reg = this.state.regimes[regimeKey];
        if (!reg || reg.trades.length < 20) return;

        const recent = reg.trades.slice(-30);
        const winRate = recent.filter(t => t.outcome === 1).length / recent.length;
        const avgWin = recent.filter(t => t.outcome === 1).reduce((s, t) => s + t.pnl, 0) / (recent.filter(t => t.outcome === 1).length || 1);
        const avgLoss = Math.abs(recent.filter(t => t.outcome === -1).reduce((s, t) => s + t.pnl, 0)) / (recent.filter(t => t.outcome === -1).length || 1);
        const profitFactor = avgLoss > 0 ? (avgWin / avgLoss) : 1;

        // Dynamic MinScore: If sharpe > 0.5, we can lower minScore (trust the system). If sharpe < 0, raise it.
        let minScoreOffset = 0;
        if (reg.sharpe > 0.8) minScoreOffset = -0.5; // More aggressive
        else if (reg.sharpe > 0.3) minScoreOffset = -0.2;
        else if (reg.sharpe < -0.5) minScoreOffset = 1.5; // Much stricter
        else if (reg.sharpe < -0.2) minScoreOffset = 0.5;

        // Dynamic Risk Multiplier: Based on Profit Factor and Win Rate
        let riskMultiplier = 1.0;
        if (profitFactor > 1.8 && winRate > 0.5) riskMultiplier = 1.3;
        else if (profitFactor > 1.3 && winRate > 0.45) riskMultiplier = 1.1;
        else if (profitFactor < 0.8 || winRate < 0.35) riskMultiplier = 0.6;
        else if (profitFactor < 0.6) riskMultiplier = 0.3;

        this.state.globalParams.minScoreOffset = Math.min(2, Math.max(-1, minScoreOffset));
        this.state.globalParams.riskMultiplier = Math.min(1.5, Math.max(0.3, riskMultiplier));
        this.state.globalParams.lastUpdate = Date.now();
    }

    // ─── GETTERS FOR BOT ENGINE ──────────────────────────────────────────
    getRegimeWeights(regime) {
        const key = this.regimeMap[regime] || 'normal';
        const reg = this.state.regimes[key];
        if (!reg || reg.count < 10) return null; // Not enough data

        const weights = {};
        Object.keys(reg.factors).forEach(f => {
            const stat = reg.factors[f];
            if (stat.count < 5) return;
            const wr = stat.wins / stat.count;
            // Map win rate to a bonus/penalty: 0.5 -> 0, 0.6 -> +0.3, 0.7 -> +0.6, 0.4 -> -0.3
            const bonus = (wr - 0.5) * 3;
            weights[f] = Math.min(1.5, Math.max(-1.5, bonus));
        });
        return weights;
    }

    getOptimalTPMultipliers(analysis, regime, baseTp1, baseTp2, baseTp3) {
        const key = this.regimeMap[regime] || 'normal';
        const reg = this.state.regimes[key];
        if (!reg || reg.trades.length < 20) return { tp1: baseTp1, tp2: baseTp2, tp3: baseTp3 };

        // Adjust based on historical TP performance in this regime
        const adjust = (tpKey, base) => {
            const stat = reg.tpStats[tpKey];
            if (!stat || stat.count < 5) return base;
            const hitRate = stat.hits / stat.count;
            const avgPnl = stat.totalPnl / stat.count;
            // If hit rate is high (>60%), we can increase the distance (more aggressive)
            // If hit rate is low (<40%), we decrease the distance or move it closer
            let factor = 1.0;
            if (hitRate > 0.6 && avgPnl > 0) factor = 1.2;
            else if (hitRate < 0.35 || avgPnl < 0) factor = 0.7;
            else if (hitRate < 0.45) factor = 0.9;
            return parseFloat((base * factor).toFixed(2));
        };

        return {
            tp1: adjust('tp1', baseTp1),
            tp2: adjust('tp2', baseTp2),
            tp3: adjust('tp3', baseTp3)
        };
    }

    getEntryTypeBias(regime) {
        const key = this.regimeMap[regime] || 'normal';
        const reg = this.state.regimes[key];
        if (!reg) return null;

        let bestType = null;
        let bestScore = -Infinity;
        Object.keys(reg.entries).forEach(type => {
            const stat = reg.entries[type];
            if (stat.count < 3) return;
            const wr = stat.wins / stat.count;
            const avgPnl = stat.totalPnl / stat.count;
            const score = wr * avgPnl; // Expectancy proxy
            if (score > bestScore) {
                bestScore = score;
                bestType = type;
            }
        });
        return bestType;
    }

    getGlobalAdjustments() {
        return {
            minScoreOffset: this.state.globalParams?.minScoreOffset || 0,
            riskMultiplier: this.state.globalParams?.riskMultiplier || 1.0
        };
    }

    // ─── RESET (for testing) ──────────────────────────────────────────────
    reset() {
        this.state = { regimes: {}, globalParams: { minScoreOffset: 0, riskMultiplier: 1.0, lastUpdate: Date.now() } };
        this.saveState();
        logger.info('[EnhancedLearner] State reset.');
    }
}

module.exports = { EnhancedLearner };
