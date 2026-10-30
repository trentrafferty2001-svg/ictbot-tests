// ════════════════════════════════════════════════════════════════════════════
//  Auto-Optimizer – Adjusts confluence weights and thresholds using GA-like logic
// ════════════════════════════════════════════════════════════════════════════

function autoOptimize(journalTrades, currentConfig, options = {}) {
  const closed = journalTrades.filter(t => t.outcome !== null).slice(-50);
  if (closed.length < 30) return currentConfig;

  const factorStats = {};
  const factors = ['fvg', 'ob', 'mss', 'liqSweep', 'ote', 'tripleZone', 'killZone', 'silverBullet', 'divergence', 'pattern', 'vsaConfirms', 'breakerBlock', 'candlePattern'];
  for (const f of factors) {
    const withFactor = closed.filter(t => t.factors && t.factors.includes(f));
    if (withFactor.length < 15) continue;
    const wins = withFactor.filter(t => t.outcome === 'win').length;
    const wr = wins / withFactor.length;
    factorStats[f] = { count: withFactor.length, winRate: wr };
  }

  const newWeights = { ...currentConfig.CONFLUENCE_WEIGHTS };
  for (const f of factors) {
    if (!factorStats[f]) continue;
    const wr = factorStats[f].winRate;
    let adjustment = 0;
    if (wr > 0.65) adjustment = 1;
    else if (wr < 0.35) adjustment = -1;
    if (adjustment !== 0) {
      newWeights[f] = Math.max(0, Math.min(5, (newWeights[f] || 1) + adjustment));
    }
  }

  let newMinQuality = currentConfig.QUALITY_CONFIG.minQualityScore;
  const recentWinRate = closed.filter(t => t.outcome === 'win').length / closed.length;
  if (recentWinRate > 0.6 && closed.length > 30) {
    newMinQuality = Math.max(5, newMinQuality - 1);
  } else if (recentWinRate < 0.4) {
    newMinQuality = Math.min(10, newMinQuality + 1);
  }

  return {
    CONFLUENCE_WEIGHTS: newWeights,
    QUALITY_CONFIG: { ...currentConfig.QUALITY_CONFIG, minQualityScore: newMinQuality },
  };
}

module.exports = { autoOptimize };
