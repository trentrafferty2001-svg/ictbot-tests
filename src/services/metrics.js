// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — Metrics Service v1.0
//  Tracks performance metrics for monitoring and debugging
// ════════════════════════════════════════════════════════════════════════════

class MetricsService {
  constructor() {
    this.metrics = {
      // Counters
      tradesPlaced: 0,
      tradesFailed: 0,
      apiCalls: 0,
      apiErrors: 0,
      cyclesRun: 0,
      cycleErrors: 0,
      telegramSent: 0,
      telegramFailed: 0,
      
      // Timing
      cycleTimes: [],
      apiLatencies: [],
      
      // State
      startTime: Date.now(),
      lastCycleTime: null,
      lastTradeTime: null,
      
      // Performance
      winCount: 0,
      lossCount: 0,
      totalPnl: 0,
    };
  }
  
  increment(name, value = 1) {
    if (this.metrics[name] !== undefined) {
      this.metrics[name] += value;
    }
  }
  
  recordCycle(duration, status) {
    this.metrics.cyclesRun++;
    this.metrics.lastCycleTime = Date.now();
    this.metrics.cycleTimes.push(duration);
    
    // Keep last 100 cycle times
    if (this.metrics.cycleTimes.length > 100) {
      this.metrics.cycleTimes = this.metrics.cycleTimes.slice(-100);
    }
  }
  
  recordTrade(win, pnl) {
    this.metrics.tradesPlaced++;
    this.metrics.lastTradeTime = Date.now();
    if (win) {
      this.metrics.winCount++;
    } else {
      this.metrics.lossCount++;
    }
    this.metrics.totalPnl += pnl;
  }
  
  recordApiCall(latency, success) {
    this.metrics.apiCalls++;
    if (!success) this.metrics.apiErrors++;
    this.metrics.apiLatencies.push(latency);
    
    if (this.metrics.apiLatencies.length > 1000) {
      this.metrics.apiLatencies = this.metrics.apiLatencies.slice(-1000);
    }
  }
  
  getAverageCycleTime() {
    const times = this.metrics.cycleTimes;
    if (times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
  
  getAverageApiLatency() {
    const latencies = this.metrics.apiLatencies;
    if (latencies.length === 0) return 0;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }
  
  getWinRate() {
    const total = this.metrics.winCount + this.metrics.lossCount;
    if (total === 0) return 0;
    return (this.metrics.winCount / total) * 100;
  }
  
  getUptime() {
    return Math.round((Date.now() - this.metrics.startTime) / 1000);
  }
  
  getAll() {
    return {
      ...this.metrics,
      averageCycleTime: this.getAverageCycleTime(),
      averageApiLatency: this.getAverageApiLatency(),
      winRate: this.getWinRate(),
      uptime: this.getUptime(),
    };
  }
}

module.exports = { MetricsService };
