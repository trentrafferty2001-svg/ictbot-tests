// ════════════════════════════════════════════════════════════════════════════
//  Loss Limit Calculations
// ════════════════════════════════════════════════════════════════════════════

function getDailyLossLimit(balance, maxDailyLossPercent) {
  return balance * (maxDailyLossPercent / 100);
}

function getMonthlyLossLimit(balance, maxMonthlyLossPercent) {
  return balance * (maxMonthlyLossPercent / 100);
}

function checkDailyLossLimit(dailyPnl, unrealisedPnl, balance, maxDailyLossPercent) {
  const limit = getDailyLossLimit(balance, maxDailyLossPercent);
  const effectivePnl = dailyPnl + (unrealisedPnl || 0);
  const isBreached = effectivePnl < -limit;
  
  return {
    isBreached,
    limit,
    effectivePnl,
    remaining: limit + effectivePnl,
    percent: (Math.abs(effectivePnl) / limit) * 100,
  };
}

function checkMonthlyLossLimit(monthlyPnl, balance, maxMonthlyLossPercent) {
  const limit = getMonthlyLossLimit(balance, maxMonthlyLossPercent);
  const isBreached = monthlyPnl < -limit;
  
  return {
    isBreached,
    limit,
    monthlyPnl,
    remaining: limit + monthlyPnl,
    percent: (Math.abs(monthlyPnl) / limit) * 100,
  };
}

module.exports = {
  getDailyLossLimit,
  getMonthlyLossLimit,
  checkDailyLossLimit,
  checkMonthlyLossLimit,
};
