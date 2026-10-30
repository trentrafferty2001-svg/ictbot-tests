// ════════════════════════════════════════════════════════════════════════════
//  Kelly Criterion for position sizing
// ════════════════════════════════════════════════════════════════════════════

function getKellyRisk(winRate, avgWin, avgLoss) {
  if (winRate <= 0 || avgWin <= 0 || avgLoss <= 0) {
    return 0.01;
  }
  
  const b = avgWin / avgLoss;
  const q = 1 - winRate;
  const kelly = winRate - (q / b);
  
  const halfKelly = Math.max(0.01, Math.min(0.25, kelly * 0.5));
  
  return halfKelly;
}

// [IMPROVED] Now supports version filtering to avoid mixing pre/post-fix trades
function getKellyRiskFromTrades(trades, options = {}) {
  const targetVersion = options.targetVersion || null;
  const minTrades = options.minTrades || 10;
  
  if (!trades || trades.length === 0) {
    return { kelly: 0.01, winRate: 0.5, avgWin: 0, avgLoss: 0, trades: 0 };
  }
  
  // Filter by version if specified
  let filteredTrades = trades;
  if (targetVersion) {
    const versionMatches = trades.filter(t => t.codeVersion === targetVersion);
    // Only use version-filtered trades if we have enough; otherwise fall back to all trades
    if (versionMatches.length >= minTrades) {
      filteredTrades = versionMatches;
    }
  }
  
  const closed = filteredTrades.filter(t => t.outcome !== null);
  if (closed.length < minTrades) {
    // If we have too few closed trades, use all trades but flag it
    const allClosed = trades.filter(t => t.outcome !== null);
    if (allClosed.length >= minTrades) {
      const fallbackResult = calculateKellyFromClosed(allClosed);
      return {
        ...fallbackResult,
        trades: closed.length,
        usingFallback: true,
        fallbackReason: `Only ${closed.length} trades on current version, using ${allClosed.length} total trades`,
      };
    }
    return { 
      kelly: 0.01, 
      winRate: 0.5, 
      avgWin: 0, 
      avgLoss: 0, 
      trades: closed.length,
      usingFallback: false,
    };
  }
  
  const result = calculateKellyFromClosed(closed);
  return {
    ...result,
    trades: closed.length,
    usingFallback: false,
    versionFiltered: !!targetVersion,
  };
}

function calculateKellyFromClosed(closed) {
  const wins = closed.filter(t => t.outcome === 'win');
  const losses = closed.filter(t => t.outcome === 'loss');
  
  const winRate = wins.length / closed.length;
  const avgWin = wins.length > 0 
    ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length 
    : 0;
  const avgLoss = losses.length > 0 
    ? Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0)) / losses.length 
    : 0;
  
  const kelly = getKellyRisk(winRate, avgWin, avgLoss);
  
  return {
    kelly,
    winRate,
    avgWin,
    avgLoss,
    trades: closed.length,
  };
}

function blendKellyWithRisk(kelly, baseRisk, minRisk = 0.3, maxRisk = 3.0) {
  if (kelly <= 0.01) {
    return Math.min(baseRisk, 0.5);
  }
  
  const kellyPct = kelly * 100;
  const blended = Math.min(baseRisk, kellyPct * 1.5);
  
  return Math.max(minRisk, Math.min(maxRisk, blended));
}

module.exports = {
  getKellyRisk,
  getKellyRiskFromTrades,
  blendKellyWithRisk,
};
