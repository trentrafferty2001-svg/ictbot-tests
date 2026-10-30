// ════════════════════════════════════════════════════════════════════════════
//  src/strategies/scalper.js
//  Scalping strategy for M5 – quick entries with tight stops
// ════════════════════════════════════════════════════════════════════════════

const indicators = require('../indicators');

function analyzeScalp(m5, m15, atr, curP, session) {
  const activeSessions = ['london', 'ny_open', 'ny'];
  if (!activeSessions.includes(session.session)) {
    return { signal: 'none', score: 0, hits: [] };
  }

  if (!m5 || m5.length < 20) return { signal: 'none', score: 0, hits: [] };

  const m5Atr = indicators.calcATR14(m5);
  const m5Swings = indicators.detectSwings(m5, { atr: m5Atr });
  const m5Mss = indicators.detectMSS(m5, m5Swings, curP, m5Atr);
  const m5Fvgs = indicators.detectFVG(m5, curP, m5Atr);
  const m5Obs = indicators.detectOB(m5, curP, m5Atr);
  const m5Liq = indicators.detectLiqSweep(m5, m5Swings);

  let score = 0;
  const hits = [];
  let signal = 'none';

  // MSS must be fresh (within last 3 M5 candles)
  if (m5Mss.dir !== 'neutral' && m5Mss.level && (m5.length - m5Mss.idx < 3)) {
    signal = m5Mss.dir === 'bullish' ? 'buy' : 'sell';
    score += 3;
    hits.push('M5 MSS +3');
  }

  const freshFVG = m5Fvgs.filter(f => f.isFresh && f.approaching);
  if (freshFVG.length > 0) {
    const fvg = freshFVG[0];
    if (fvg.type === (signal === 'buy' ? 'bull' : 'bear')) {
      score += 2;
      hits.push('M5 FVG approaching +2');
    }
  }

  const inOB = m5Obs.filter(o => o.inZone && o.isFresh);
  if (inOB.length > 0) {
    const ob = inOB[0];
    if (ob.type === (signal === 'buy' ? 'bull' : 'bear')) {
      score += 1;
      hits.push('M5 OB in zone +1');
    }
  }

  if (m5Liq.swept) {
    score += 1;
    hits.push('M5 liq sweep +1');
  }

  if (score >= 3 && signal !== 'none') {
    return {
      signal,
      score: Math.min(8, score),
      hits,
      entryType: 'scalp',
      stopMultiplier: 0.5,
      takeMultiplier: 1.5,
      atr: m5Atr,
    };
  }

  return { signal: 'none', score: 0, hits: [] };
}

module.exports = { analyzeScalp };
