// src/analysis/seasonality-advanced.js
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

class SeasonalityAdvanced {
    constructor() {
        this.cache = { data: null, timestamp: 0 };
        this.TTL = 24 * 60 * 60 * 1000;
        this.file = path.join('/tmp', 'seasonality_advanced.json');
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.file)) {
                this.cache.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            }
        } catch (e) {}
        if (!this.cache.data) {
            this.cache.data = {
                monthly: {},
                weekly: {},
                holiday: {}
            };
        }
    }

    save() {
        try {
            fs.writeFileSync(this.file, JSON.stringify(this.cache.data, null, 2));
        } catch (e) {}
    }

    // Record trade outcome for seasonality learning
    recordTrade(date, outcome, pnl) {
        const month = date.getUTCMonth();
        const day = date.getUTCDay();
        const monthKey = String(month);
        const dayKey = String(day);
        if (!this.cache.data.monthly[monthKey]) {
            this.cache.data.monthly[monthKey] = { wins: 0, losses: 0, totalPnl: 0, trades: 0 };
        }
        if (!this.cache.data.weekly[dayKey]) {
            this.cache.data.weekly[dayKey] = { wins: 0, losses: 0, totalPnl: 0, trades: 0 };
        }
        const m = this.cache.data.monthly[monthKey];
        const w = this.cache.data.weekly[dayKey];
        m.trades++;
        w.trades++;
        if (outcome === 'win') { m.wins++; w.wins++; }
        else { m.losses++; w.losses++; }
        m.totalPnl += pnl;
        w.totalPnl += pnl;
        this.save();
    }

    getMonthlyBias(date) {
        const month = date.getUTCMonth();
        const key = String(month);
        const data = this.cache.data.monthly[key];
        if (!data || data.trades < 5) return { bias: 'neutral', confidence: 0.5 };
        const wr = data.wins / data.trades;
        const bias = wr > 0.55 ? 'bullish' : wr < 0.45 ? 'bearish' : 'neutral';
        const confidence = Math.min(0.8, 0.5 + Math.abs(wr - 0.5) * 2);
        return { bias, confidence, winRate: wr };
    }

    getWeeklyBias(date) {
        const day = date.getUTCDay();
        const key = String(day);
        const data = this.cache.data.weekly[key];
        if (!data || data.trades < 5) return { bias: 'neutral', confidence: 0.5 };
        const wr = data.wins / data.trades;
        const bias = wr > 0.55 ? 'bullish' : wr < 0.45 ? 'bearish' : 'neutral';
        const confidence = Math.min(0.8, 0.5 + Math.abs(wr - 0.5) * 2);
        return { bias, confidence, winRate: wr };
    }

    // Holiday effects: Chinese New Year, Diwali, etc.
    getHolidayBias(date) {
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        // Simplified: Chinese New Year (Jan-Feb), Diwali (Oct-Nov)
        const cny = (month === 0 || month === 1); // Jan-Feb
        const diwali = (month === 9 || month === 10); // Oct-Nov
        if (cny) return { bias: 'bullish', confidence: 0.6, reason: 'Chinese New Year (gold demand)' };
        if (diwali) return { bias: 'bullish', confidence: 0.55, reason: 'Diwali (gold demand)' };
        return { bias: 'neutral', confidence: 0.5, reason: 'No holiday' };
    }

    async getRecommendation(date) {
        const monthly = this.getMonthlyBias(date);
        const weekly = this.getWeeklyBias(date);
        const holiday = this.getHolidayBias(date);
        let score = 0;
        if (monthly.bias === 'bullish') score += 0.3 * monthly.confidence;
        else if (monthly.bias === 'bearish') score -= 0.3 * monthly.confidence;
        if (weekly.bias === 'bullish') score += 0.2 * weekly.confidence;
        else if (weekly.bias === 'bearish') score -= 0.2 * weekly.confidence;
        if (holiday.bias === 'bullish') score += 0.4 * holiday.confidence;
        const bias = score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral';
        const confidence = Math.min(0.9, 0.5 + Math.abs(score));
        return {
            bias,
            confidence,
            score,
            monthly: monthly.bias,
            weekly: weekly.bias,
            holiday: holiday.bias,
            description: `Seasonality: ${bias} (score ${score.toFixed(2)})`
        };
    }
}

module.exports = { SeasonalityAdvanced };
