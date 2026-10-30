// ════════════════════════════════════════════════════════════════════════════
//  Market Regime Detection – Multi-timeframe, phase-based classification
// ════════════════════════════════════════════════════════════════════════════

const { calcADX, calcATR14, detectSwings } = require('../indicators');

function detectRegimeAdvanced(candlesH4, candlesH1, candlesM15, options = {}) {
  if (!candlesH4 || candlesH4.length < 50) {
    return { regime: 'unknown', phase: 'unknown', confidence: 0 };
  }

  // ── 1. Trend Strength (ADX) ──────────────────────────────────────────────
  const adxH4 = calcADX(candlesH4);
  const adxH1 = calcADX(candlesH1);
  const adxM15 = calcADX(candlesM15);
  const avgADX = (adxH4.adx + adxH1.adx + adxM15.adx) / 3;

  // ── 2. Volatility (ATR ratio) ──────────────────────────────────────────────
  const atrH4 = calcATR14(candlesH4);
  const atrAvg = candlesH4.slice(-20).reduce((s, c) => s + (c.high - c.low), 0) / 20;
  const volRatio = atrH4 / atrAvg;

  // ── 3. Trend Direction (EMA slope + price position) ──────────────────────
  const ema20 = ema(candlesH4, 20);
  const ema50 = ema(candlesH4, 50);
  const price = candlesH4[candlesH4.length - 1].close;
  const trendDirection = price > ema20 && ema20 > ema50 ? 'bullish' 
                       : price < ema20 && ema20 < ema50 ? 'bearish' 
                       : 'neutral';

  // ── 4. Market Phase (Wyckoff-like) ────────────────────────────────────────
  // Use swing highs/lows to detect accumulation/distribution patterns
  const swings = detectSwings(candlesH4);
  const phase = detectPhase(swings, price, atrH4);

  // ── 5. Combine into regime ────────────────────────────────────────────────
  let regime = 'normal';
  let confidence = 0.5;

  if (avgADX > 25 && volRatio > 1.2) {
    regime = 'strong_trend';
    confidence = 0.8;
  } else if (avgADX > 20 && volRatio > 0.8) {
    regime = 'trending';
    confidence = 0.7;
  } else if (avgADX < 20 && volRatio < 0.8) {
    regime = 'ranging';
    confidence = 0.6;
  } else if (volRatio > 1.5) {
    regime = 'volatile';
    confidence = 0.7;
  } else {
    regime = 'normal';
    confidence = 0.5;
  }

  // ── 6. Recommendations ────────────────────────────────────────────────────
  const recommendations = {
    riskMultiplier: regime === 'volatile' ? 0.6 
                   : regime === 'strong_trend' ? 1.2 
                   : regime === 'trending' ? 1.0 
                   : regime === 'ranging' ? 0.5 
                   : 0.8,
    minScoreBonus: regime === 'strong_trend' ? 2 
                  : regime === 'trending' ? 1 
                  : 0,
    avoidCounterTrend: regime === 'strong_trend' || regime === 'trending',
    preferRangeTrades: regime === 'ranging',
  };

  return {
    regime,
    phase,
    confidence,
    adx: { h4: adxH4.adx, h1: adxH1.adx, m15: adxM15.adx, avg: avgADX },
    volRatio,
    trendDirection,
    recommendations,
    // Helper flags
    isTrending: regime === 'trending' || regime === 'strong_trend',
    isRanging: regime === 'ranging',
    isVolatile: regime === 'volatile',
    timestamp: new Date().toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function ema(candles, period) {
  // Simple EMA calculation
  const closes = candles.map(c => c.close);
  let ema = closes[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function detectPhase(swings, price, atr) {
  // Simplified phase detection
  if (swings.highs.length < 3 || swings.lows.length < 3) return 'unknown';
  const lastHigh = swings.highs[swings.highs.length - 1].price;
  const prevHigh = swings.highs[swings.highs.length - 2].price;
  const lastLow = swings.lows[swings.lows.length - 1].price;
  const prevLow = swings.lows[swings.lows.length - 2].price;

  if (lastHigh > prevHigh && lastLow > prevLow) return 'markup';
  if (lastHigh < prevHigh && lastLow < prevLow) return 'markdown';
  if (lastHigh > prevHigh && lastLow < prevLow) return 'accumulation'; // widening range
  if (lastHigh < prevHigh && lastLow > prevLow) return 'distribution'; // narrowing range
  return 'unknown';
}

module.exports = { detectRegimeAdvanced };
