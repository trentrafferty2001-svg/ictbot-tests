// ════════════════════════════════════════════════════════════════════════════
//  Advanced Risk Management – Kelly, Anti-Martingale, Drawdown Protection
// ════════════════════════════════════════════════════════════════════════════

function calculateKellyRisk(winRate, avgWin, avgLoss, volatility) {
  if (winRate <= 0 || avgWin <= 0 || avgLoss <= 0) return 0.01;
  const b = avgWin / avgLoss;
  const q = 1 - winRate;
  let kelly = (winRate * b - q) / b;
  kelly = Math.max(0.01, Math.min(0.25, kelly * 0.5));
  if (volatility > 1.5) kelly *= 0.7;
  else if (volatility < 0.5) kelly *= 1.2;
  return Math.min(0.03, kelly);
}

function getAntiMartingaleRisk(baseRisk, consecWins, consecLosses, maxFactor = 2.0, minFactor = 0.3) {
  let factor = 1.0;
  if (consecWins >= 3) factor = Math.min(maxFactor, 1 + (consecWins - 2) * 0.15);
  else if (consecLosses >= 2) factor = Math.max(minFactor, 1 - (consecLosses - 1) * 0.25);
  return baseRisk * factor;
}

function isDailyLossBreached(dailyPnl, initialEquity, maxLossPct) {
  const lossLimit = initialEquity * (maxLossPct / 100);
  return dailyPnl <= -lossLimit;
}

function getRecommendedRisk(accountEquity, dailyPnl, consecWins, consecLosses, winRate, avgWin, avgLoss, volatility, options = {}) {
  let risk = options.baseRisk || 0.5;
  if (options.useKelly !== false) {
    const kellyRisk = calculateKellyRisk(winRate, avgWin, avgLoss, volatility) * 100;
    risk = Math.min(risk, kellyRisk);
  }
  if (options.useAntiMartingale !== false) {
    risk = getAntiMartingaleRisk(risk, consecWins, consecLosses, options.maxFactor, options.minFactor);
  }
  if (volatility > 1.5) risk *= 0.8;
  else if (volatility < 0.5) risk *= 1.2;
  risk = Math.max(options.minRisk || 0.2, Math.min(options.maxRisk || 3.0, risk));
  return risk;
}

module.exports = {
  calculateKellyRisk,
  getAntiMartingaleRisk,
  isDailyLossBreached,
  getRecommendedRisk,
};
