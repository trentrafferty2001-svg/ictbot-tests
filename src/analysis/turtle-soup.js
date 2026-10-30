// ════════════════════════════════════════════════════════════════════════════
//  src/analysis/turtle-soup.js
//  Turtle Soup Pattern Detection - ICT-style
//  Identifies equal highs/lows being swept then reversing
// ════════════════════════════════════════════════════════════════════════════

const indicators = require('../indicators');

function detectTurtleSoup(candles, swings, atr) {
  if (!candles || candles.length < 20) {
    return { pattern: 'none', confidence: 0, entries: [] };
  }

  const _atr = atr || indicators.calcATR14(candles);
  const results = [];

  // ─── 1. Find Equal Highs/Lows ──────────────────────────────────────────
  const tolerance = _atr * 0.15;
  const recentHighs = swings.highs.slice(-8);
  const recentLows = swings.lows.slice(-8);

  // Group equal highs
  const highGroups = [];
  for (const h of recentHighs) {
    let found = false;
    for (const g of highGroups) {
      if (Math.abs(g.level - h.price) < tolerance) {
        g.count++;
        g.levels.push(h.price);
        g.indices.push(h.idx);
        found = true;
        break;
      }
    }
    if (!found) {
      highGroups.push({ level: h.price, count: 1, levels: [h.price], indices: [h.idx], type: 'high' });
    }
  }

  // Group equal lows
  const lowGroups = [];
  for (const l of recentLows) {
    let found = false;
    for (const g of lowGroups) {
      if (Math.abs(g.level - l.price) < tolerance) {
        g.count++;
        g.levels.push(l.price);
        g.indices.push(l.idx);
        found = true;
        break;
      }
    }
    if (!found) {
      lowGroups.push({ level: l.price, count: 1, levels: [l.price], indices: [l.idx], type: 'low' });
    }
  }

  // ─── 2. Check for Sweeps ────────────────────────────────────────────────
  const last = candles[candles.length - 1];

  // Bearish Turtle Soup: equal highs swept then bearish rejection
  for (const group of highGroups) {
    if (group.count < 2) continue;
    const level = group.level;
    const swept = last.high > level && last.close < level - tolerance;
    if (swept) {
      results.push({
        type: 'bearish',
        level: level,
        count: group.count,
        confidence: Math.min(85, 65 + group.count * 10),
        entryPrice: level,
        stopLoss: level + _atr * 0.5,
        takeProfit: level - _atr * 1.5,
        description: `Bearish Turtle Soup at ${level.toFixed(2)} (${group.count} equal highs)`
      });
    }
  }

  // Bullish Turtle Soup: equal lows swept then bullish rejection
  for (const group of lowGroups) {
    if (group.count < 2) continue;
    const level = group.level;
    const swept = last.low < level && last.close > level + tolerance;
    if (swept) {
      results.push({
        type: 'bullish',
        level: level,
        count: group.count,
        confidence: Math.min(85, 65 + group.count * 10),
        entryPrice: level,
        stopLoss: level - _atr * 0.5,
        takeProfit: level + _atr * 1.5,
        description: `Bullish Turtle Soup at ${level.toFixed(2)} (${group.count} equal lows)`
      });
    }
  }

  // ─── 3. Return Best Pattern ─────────────────────────────────────────────
  const best = results.length > 0 
    ? results.reduce((a, b) => a.confidence > b.confidence ? a : b) 
    : null;

  return {
    pattern: best ? (best.type === 'bullish' ? 'bullish' : 'bearish') : 'none',
    confidence: best ? best.confidence : 0,
    entries: results,
    bestPattern: best
  };
}

function getTurtleSoupEntry(analysis, candles, swings, atr) {
  const result = detectTurtleSoup(candles, swings, atr);
  if (result.pattern === 'none') return null;

  const best = result.bestPattern;
  if (!best) return null;

  // Only use if confidence is high enough and aligns with bias
  if (best.confidence < 65) return null;

  return {
    signal: best.type,
    entryPrice: best.entryPrice,
    stopLoss: best.stopLoss,
    takeProfit: best.takeProfit,
    confidence: best.confidence / 100,
    description: best.description
  };
}

module.exports = { detectTurtleSoup, getTurtleSoupEntry };
