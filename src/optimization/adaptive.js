// ════════════════════════════════════════════════════════════════════════════
//  Adaptive Parameter Tuning – Adjusts strategy parameters based on live performance
// ════════════════════════════════════════════════════════════════════════════

function getAdaptiveParams(state, trades, marketRegime, options = {}) {
  const defaultParams = {
    risk: 1.0,
    minScore: 7,
    maxTrades: 3,
    useKelly: true,
    trailActivation: 1.5,
  };

  if (!trades || trades.length < 20) return defaultParams;

  // ── 1. Recent Win Rate (last 20 trades) ──────────────────────────────────
  const closed = trades.filter(t => t.outcome !== null).slice(-20);
  if (closed.length < 10) return defaultParams;

  const wins = closed.filter(t => t.outcome === 'win').length;
  const winRate = wins / closed.length;

  // ── 2. Recent PnL (last 10 trades) ──────────────────────────────────────
  const recent10 = closed.slice(-10);
  const totalPnl = recent10.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgWin = recent10.filter(t => t.outcome === 'win').reduce((s, t) => s + (t.pnl || 0), 0) / (recent10.filter(t => t.outcome === 'win').length || 1);
  const avgLoss = Math.abs(recent10.filter(t => t.outcome === 'loss').reduce((s, t) => s + (t.pnl || 0), 0) / (recent10.filter(t => t.outcome === 'loss').length || 1));

  // ── 3. Adjust risk based on win rate and market regime ──────────────────
  let risk = defaultParams.risk;
  if (winRate > 0.6) risk = Math.min(2.0, risk * 1.2);
  else if (winRate < 0.4) risk = Math.max(0.3, risk * 0.7);
  else risk = risk;

  // Regime adjustment
  if (marketRegime === 'strong_trend') risk *= 1.1;
  else if (marketRegime === 'volatile') risk *= 0.7;
  else if (marketRegime === 'ranging') risk *= 0.8;

  risk = Math.round(Math.min(3.0, Math.max(0.3, risk)) * 10) / 10;

  // ── 4. Adjust minScore based on win rate ────────────────────────────────
  let minScore = defaultParams.minScore;
  if (winRate > 0.6) minScore = Math.max(5, minScore - 1);
  else if (winRate < 0.4) minScore = Math.min(9, minScore + 1);
  else minScore = minScore;

  // ── 5. Adjust maxTrades based on recent performance ──────────────────────
  let maxTrades = defaultParams.maxTrades;
  if (totalPnl < 0 && recent10.length >= 10) {
    maxTrades = Math.max(1, maxTrades - 1);
  } else if (totalPnl > 0 && winRate > 0.5) {
    maxTrades = Math.min(5, maxTrades + 1);
  }

  // ── 6. Profit factor based trailing activation ──────────────────────────
  let trailActivation = defaultParams.trailActivation;
  if (avgWin > avgLoss * 2) trailActivation = 1.2; // tighten trail in high RR environment
  else trailActivation = 1.5;

  return {
    risk,
    minScore,
    maxTrades,
    trailActivation,
    useKelly: winRate > 0.45, // only use Kelly if win rate is decent
    adjusted: true,
    winRate,
    totalPnl,
    avgWin,
    avgLoss,
  };
}

module.exports = { getAdaptiveParams };
