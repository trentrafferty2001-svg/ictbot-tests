// ════════════════════════════════════════════════════════════════════════════
//  src/optimization/gate-relaxer.js
//  Adaptive Gate Relaxation – dynamically lowers thresholds when idle
// ════════════════════════════════════════════════════════════════════════════

function getRelaxedParams(state, analysis, cfg, regime) {
  const now = Date.now();
  const lastTradeTime = state.lastTradeTime || state.lastRun ? new Date(state.lastRun).getTime() : now;
  const hoursSinceTrade = (now - lastTradeTime) / (1000 * 60 * 60);
  const atr = analysis.atr || 5;
  const atrRatio = regime.atrRatio || 1;
  const volatility = regime.volatility || 'normal';
  
  let minScore = cfg.minScore || 7;
  let kzRequired = true;
  let htfRequired = true;
  let regimeSkipPenalty = true;

  // ── 1. Time‑since‑last‑trade relaxation ──────────────────────────────
  if (hoursSinceTrade > 4) {
    const reduction = hoursSinceTrade > 12 ? 2 : 1;
    minScore = Math.max(4, minScore - reduction);
    if (analysis.score >= 9) {
      kzRequired = false;
    }
  }

  // ── 2. Volatility adjustment ──────────────────────────────────────────
  if (volatility === 'high' && atrRatio > 1.5) {
    minScore = Math.max(4, minScore - 1);
  }

  // ── 3. Regime skip penalty relaxation ────────────────────────────────
  if (regime.regime === 'trending' && analysis.bias !== 'neutral') {
    regimeSkipPenalty = false;
  }

  // ── 4. HTF alignment relaxation ──────────────────────────────────────
  if (analysis.score >= 10 && analysis.bias !== 'neutral') {
    htfRequired = false;
  }

  // ── 5. Special: if no trade in 24h, heavily relax ──────────────────
  if (hoursSinceTrade > 24 && analysis.score >= 7) {
    minScore = Math.max(4, minScore - 2);
    kzRequired = false;
    htfRequired = false;
    regimeSkipPenalty = false;
  }

  minScore = Math.min(10, Math.max(4, minScore));

  return {
    effectiveMinScore: minScore,
    kzRequired,
    htfRequired,
    regimeSkipPenalty,
    relaxed: minScore < (cfg.minScore || 7) || !kzRequired || !htfRequired,
    reason: `Idle ${hoursSinceTrade.toFixed(1)}h, volatility=${volatility}, regime=${regime.regime}`,
  };
}

module.exports = { getRelaxedParams };
