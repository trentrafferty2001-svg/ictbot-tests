// ════════════════════════════════════════════════════════════════════════════
//  src/analysis/macro-trend.js
//  Macro Timeframe Trend Analysis - Weekly and Daily
// ════════════════════════════════════════════════════════════════════════════

const indicators = require('../indicators');

function analyzeMacroTrend(d1, w1) {
  const result = {
    weekly: { trend: 'neutral', strength: 0, direction: 'neutral' },
    daily: { trend: 'neutral', strength: 0, direction: 'neutral' },
    overall: 'neutral',
    confidence: 0,
    recommendation: 'neutral'
  };

  // ─── Weekly Analysis ────────────────────────────────────────────────────
  if (w1 && w1.length >= 20) {
    const w1Trend = detectTrend(w1);
    result.weekly = {
      trend: w1Trend.direction,
      strength: w1Trend.strength,
      direction: w1Trend.direction,
      emaBias: w1Trend.emaBias,
      structureBias: w1Trend.structureBias,
      adx: w1Trend.adx
    };
  }

  // ─── Daily Analysis ─────────────────────────────────────────────────────
  if (d1 && d1.length >= 20) {
    const d1Trend = detectTrend(d1);
    result.daily = {
      trend: d1Trend.direction,
      strength: d1Trend.strength,
      direction: d1Trend.direction,
      emaBias: d1Trend.emaBias,
      structureBias: d1Trend.structureBias,
      adx: d1Trend.adx
    };
  }

  // ─── Determine Overall Trend ───────────────────────────────────────────
  const weeklyDir = result.weekly.direction;
  const dailyDir = result.daily.direction;

  if (weeklyDir === 'bullish' && dailyDir === 'bullish') {
    result.overall = 'strong_bullish';
    result.confidence = 0.85;
    result.recommendation = 'buy';
  } else if (weeklyDir === 'bearish' && dailyDir === 'bearish') {
    result.overall = 'strong_bearish';
    result.confidence = 0.85;
    result.recommendation = 'sell';
  } else if (weeklyDir === 'bullish' && dailyDir !== 'bearish') {
    result.overall = 'bullish';
    result.confidence = 0.70;
    result.recommendation = 'buy';
  } else if (weeklyDir === 'bearish' && dailyDir !== 'bullish') {
    result.overall = 'bearish';
    result.confidence = 0.70;
    result.recommendation = 'sell';
  } else if (weeklyDir === 'neutral' && dailyDir === 'bullish') {
    result.overall = 'bullish_neutral';
    result.confidence = 0.55;
    result.recommendation = 'buy';
  } else if (weeklyDir === 'neutral' && dailyDir === 'bearish') {
    result.overall = 'bearish_neutral';
    result.confidence = 0.55;
    result.recommendation = 'sell';
  } else {
    result.overall = 'neutral';
    result.confidence = 0.40;
    result.recommendation = 'wait';
  }

  return result;
}

function detectTrend(candles) {
  if (!candles || candles.length < 20) {
    return { direction: 'neutral', strength: 0, emaBias: 'neutral', structureBias: 'neutral', adx: 0 };
  }

  // ─── EMA Analysis ──────────────────────────────────────────────────────
  const slice = candles.slice(-20);
  let ema8 = slice[0].close;
  let ema21 = slice[0].close;
  let ema50 = slice[0].close;

  for (let i = 1; i < slice.length; i++) {
    ema8 = slice[i].close * 2 / 9 + ema8 * 7 / 9;
    ema21 = slice[i].close * 2 / 22 + ema21 * 20 / 22;
    ema50 = slice[i].close * 2 / 51 + ema50 * 50 / 51;
  }

  const price = candles[candles.length - 1].close;
  const emaBias = price > ema8 && ema8 > ema21 && ema21 > ema50 ? 'bullish'
    : price < ema8 && ema8 < ema21 && ema21 < ema50 ? 'bearish'
    : 'neutral';

  // ─── Structure Analysis ───────────────────────────────────────────────
  const swings = indicators.detectSwings(candles);
  let structureBias = 'neutral';

  if (swings.highs.length >= 2 && swings.lows.length >= 2) {
    const lH = swings.highs[swings.highs.length - 1].price;
    const pH = swings.highs[swings.highs.length - 2].price;
    const lL = swings.lows[swings.lows.length - 1].price;
    const pL = swings.lows[swings.lows.length - 2].price;

    if (lH > pH && lL > pL) structureBias = 'bullish';
    if (lH < pH && lL < pL) structureBias = 'bearish';
  }

  // ─── ADX for Strength ─────────────────────────────────────────────────
  const adx = indicators.calcADX(candles);
  const strength = Math.min(1, adx.adx / 50);

  // ─── Combine ──────────────────────────────────────────────────────────
  let direction = 'neutral';
  if (emaBias === 'bullish' && structureBias === 'bullish') direction = 'bullish';
  else if (emaBias === 'bearish' && structureBias === 'bearish') direction = 'bearish';
  else if (emaBias !== 'neutral') direction = emaBias;
  else if (structureBias !== 'neutral') direction = structureBias;

  return {
    direction,
    strength,
    emaBias,
    structureBias,
    adx: adx.adx
  };
}

function getMacroBias(macroTrend, signal) {
  if (!macroTrend) return { align: false, scoreAdjust: 0, macroTrend: null, recommendation: 'neutral' };

  const recommendation = macroTrend.recommendation;
  
  // Check if trade signal aligns with macro trend
  const align = (signal === 'buy' && (recommendation === 'buy' || recommendation === 'strong_bullish')) ||
                (signal === 'sell' && (recommendation === 'sell' || recommendation === 'strong_bearish'));

  // Score adjustment based on alignment
  let scoreAdjust = 0;
  if (align && macroTrend.confidence > 0.7) {
    scoreAdjust = 1.5;
  } else if (align && macroTrend.confidence > 0.5) {
    scoreAdjust = 0.8;
  } else if (!align && macroTrend.confidence > 0.7) {
    scoreAdjust = -1.5;
  } else if (!align && macroTrend.confidence > 0.5) {
    scoreAdjust = -0.5;
  }

  return {
    align,
    scoreAdjust,
    macroTrend,
    recommendation: macroTrend.recommendation
  };
}

module.exports = { 
  analyzeMacroTrend, 
  detectTrend, 
  getMacroBias 
};
