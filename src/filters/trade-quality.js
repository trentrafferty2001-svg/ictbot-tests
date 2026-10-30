// ════════════════════════════════════════════════════════════════════════════
//  Trade Quality Filter – Multi-layered quality check
// ════════════════════════════════════════════════════════════════════════════

function evaluateTradeQuality(analysis, journal, config = {}) {
  const reasons = [];
  let score = 0;
  let pass = true;

  if (config.requireHTFAlignment !== false) {
    const htfAligned = (analysis.bias === 'bullish' && analysis.signal === 'buy') ||
                        (analysis.bias === 'bearish' && analysis.signal === 'sell');
    if (htfAligned) {
      score += 2;
    } else {
      reasons.push('HTF bias not aligned');
      pass = false;
    }
  }

  if (config.requireVolumeConfirmation !== false) {
    if (analysis.vsaConfirms) {
      score += 1;
    } else {
      reasons.push('No VSA confirmation');
      pass = false;
    }
  }

  if (config.requireNewsAlignment !== false) {
    if (analysis.newsSentiment && analysis.newsSentiment !== 'neutral') {
      const aligns = (analysis.signal === 'buy' && analysis.newsSentiment === 'bullish') ||
                     (analysis.signal === 'sell' && analysis.newsSentiment === 'bearish');
      if (aligns) score += 1;
      else {
        reasons.push('News sentiment conflicts');
        pass = false;
      }
    }
  }

  if (config.requireSeasonality !== false) {
    if (analysis.hourWinRate !== null) {
      if (analysis.hourWinRate > 0.55) score += 1;
      else if (analysis.hourWinRate < 0.40) {
        reasons.push('Hour historically weak');
        pass = false;
      }
    }
  }

  if (config.minSimilarWinRate) {
    const simRate = getSimilarSetupWinRate(journal.trades, analysis, 20);
    if (simRate !== null && simRate < config.minSimilarWinRate) {
      reasons.push('Similar setups low win rate');
      pass = false;
    }
  }

  if (config.maxSpreadMultiplier && analysis.spread) {
    const atr = analysis.atr || 1;
    if (analysis.spread > atr * config.maxSpreadMultiplier) {
      reasons.push('Spread too wide');
      pass = false;
    }
  }

  if (analysis.regime === 'volatile' && analysis.score < 9) {
    reasons.push('Volatile regime with low score');
    pass = false;
  }

  return {
    pass,
    score,
    reasons,
    passCount: pass ? '✅' : '❌',
  };
}

// Wilson score interval (95% one-sided) for a win rate of wins/n.
function wilsonBounds(wins, n, z = 1.645) {
  if (!(n > 0)) return { lower: 0, upper: 1 };
  const p = wins / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

// Used to block on a raw win rate from as few as 5 similar trades — mostly
// noise at that size, and self-sealing: once it blocks, no new similar trades
// happen to change the stat, so a few early losses could lock a whole class
// of setups out indefinitely. Now: at least 10 similar trades from the last
// 21 days (most recent first), and the value returned is the optimistic end
// of the 95% interval when the rate is below 50% — so the gate only blocks
// when even that is below minSimilarWinRate. Fixed 2026-10-23.
function getSimilarSetupWinRate(trades, analysis, lookback) {
  const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
  const closed = trades.filter(t => t.outcome !== null && new Date(t.closedTs || t.ts || 0).getTime() >= cutoff).slice(-100);
  const similar = [];
  for (let i = closed.length - 1; i >= 0; i--) {
    const t = closed[i];
    let match = 0;
    if (t.signal === analysis.signal) match++;
    if (t.session === analysis.session.session) match++;
    if (Math.abs(t.score - analysis.score) < 2) match++;
    if (t.divergence === analysis.divergence.type) match++;
    if (t.liqSwept === analysis.liq.swept) match++;
    if (match >= 3) similar.push(t);
    if (similar.length >= lookback) break;
  }
  if (similar.length < 10) return null;
  const wins = similar.filter(t => t.outcome === 'win').length;
  const p = wins / similar.length;
  return p < 0.5 ? Math.min(0.5, wilsonBounds(wins, similar.length).upper) : p;
}

module.exports = { evaluateTradeQuality };
