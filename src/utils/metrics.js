// ════════════════════════════════════════════════════════════════════════════
//  Performance Metrics – Real-time monitoring and logging
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const METRICS_FILE = path.join('/tmp', 'bot_metrics.json');

class MetricsCollector {
  constructor() {
    this.metrics = {
      cycleCount: 0,
      startTime: Date.now(),
      lastCycleTime: null,
      avgCycleDuration: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      totalPnl: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      peakEquity: 0,
      dailyStats: {},
      hourlyStats: {},
      errors: [],
      warnings: [],
    };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(METRICS_FILE)) {
        const data = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
        this.metrics = { ...this.metrics, ...data };
      }
    } catch (e) { /* ignore */ }
  }

  _save() {
    try {
      fs.writeFileSync(METRICS_FILE, JSON.stringify(this.metrics, null, 2));
    } catch (e) { /* ignore */ }
  }

  recordCycle(durationMs) {
    this.metrics.cycleCount++;
    this.metrics.lastCycleTime = Date.now();
    this.metrics.avgCycleDuration = 
      (this.metrics.avgCycleDuration * (this.metrics.cycleCount - 1) + durationMs) / this.metrics.cycleCount;
    this._save();
  }

  recordTrade(outcome, pnl) {
    this.metrics.tradeCount++;
    if (outcome === 'win') {
      this.metrics.winCount++;
    } else {
      this.metrics.lossCount++;
    }
    this.metrics.totalPnl += pnl;
    this._save();
  }

  recordDrawdown(currentEquity, peakEquity) {
    this.metrics.peakEquity = Math.max(this.metrics.peakEquity, peakEquity);
    const drawdown = peakEquity > 0 ? (peakEquity - currentEquity) / peakEquity : 0;
    this.metrics.currentDrawdown = drawdown;
    this.metrics.maxDrawdown = Math.max(this.metrics.maxDrawdown, drawdown);
    this._save();
  }

  recordError(error) {
    this.metrics.errors.push({
      time: new Date().toISOString(),
      message: error.message || String(error),
      stack: error.stack,
    });
    if (this.metrics.errors.length > 100) this.metrics.errors.shift();
    this._save();
  }

  recordWarning(warning) {
    this.metrics.warnings.push({
      time: new Date().toISOString(),
      message: warning,
    });
    if (this.metrics.warnings.length > 100) this.metrics.warnings.shift();
    this._save();
  }

  getSummary() {
    const winRate = this.metrics.tradeCount > 0 
      ? this.metrics.winCount / this.metrics.tradeCount 
      : 0;
    return {
      ...this.metrics,
      winRate,
      uptime: Math.round((Date.now() - this.metrics.startTime) / 1000 / 60) + 'm',
      avgCycleDuration: Math.round(this.metrics.avgCycleDuration) + 'ms',
    };
  }

  // ── Alert thresholds ──────────────────────────────────────────────────────
  shouldAlert() {
    const summary = this.getSummary();
    // Alert if win rate drops below 30% over last 20 trades
    const last20 = this.getRecentTrades(20);
    if (last20.length >= 10) {
      const recentWins = last20.filter(t => t.outcome === 'win').length;
      const recentRate = recentWins / last20.length;
      if (recentRate < 0.3) {
        return { alert: true, type: 'low_win_rate', message: `Win rate dropped to ${(recentRate*100).toFixed(0)}%` };
      }
    }
    // Alert if drawdown exceeds 10%
    if (summary.currentDrawdown > 0.1) {
      return { alert: true, type: 'high_drawdown', message: `Drawdown at ${(summary.currentDrawdown*100).toFixed(0)}%` };
    }
    return { alert: false };
  }

  getRecentTrades(n) {
    // This would need access to the trade journal; can be passed in.
    return [];
  }
}

module.exports = { MetricsCollector };
