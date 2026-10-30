// ════════════════════════════════════════════════════════════════════════════
//  src/optimization/trade-frequency-manager.js
//  Target‑based trade frequency control
// ════════════════════════════════════════════════════════════════════════════

function getFrequencyAdjustedParams(trades, dailyTarget = 2) {
  if (!trades || trades.length === 0) {
    return { minScoreAdjustment: 0, riskAdjustment: 1 };
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentTrades = trades.filter(t => new Date(t.ts).getTime() > sevenDaysAgo);

  const byDay = {};
  for (const t of recentTrades) {
    const date = new Date(t.ts).toISOString().split('T')[0];
    byDay[date] = (byDay[date] || 0) + 1;
  }

  const days = Object.keys(byDay);
  if (days.length < 3) {
    return { minScoreAdjustment: 0, riskAdjustment: 1 };
  }

  const totalTrades = Object.values(byDay).reduce((a, b) => a + b, 0);
  const avgTrades = totalTrades / days.length;
  const ratio = avgTrades / dailyTarget;
  let minScoreAdjustment = 0;
  let riskAdjustment = 1;

  if (ratio < 0.5) {
    minScoreAdjustment = -2;
    riskAdjustment = 1.2;
  } else if (ratio < 0.8) {
    minScoreAdjustment = -1;
    riskAdjustment = 1.1;
  } else if (ratio > 1.5) {
    minScoreAdjustment = 1;
    riskAdjustment = 0.9;
  } else if (ratio > 2) {
    minScoreAdjustment = 2;
    riskAdjustment = 0.8;
  }

  return {
    minScoreAdjustment,
    riskAdjustment,
    avgTrades,
    target: dailyTarget,
    ratio,
  };
}

module.exports = { getFrequencyAdjustedParams };
