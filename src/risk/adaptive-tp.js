'use strict';

const indicators = require('../indicators');

/**
 * Calculate adaptive TP levels based on swings, ATR, and RR.
 * 
 * @param {Array} candles - OHLCV array.
 * @param {number} entry - Entry price.
 * @param {string} direction - 'buy' or 'sell'.
 * @param {number} slDist - Stop loss distance.
 * @param {number} atr - Average True Range.
 * @param {number} targetRR - Desired risk-reward ratio.
 * @param {Object} regime - Regime info (volatility, market condition).
 * @param {Object} config - Additional config (e.g., swing window).
 * @returns {Object} { tp1, tp2, tp3, levels: [...] }.
 */
function calculateAdaptiveTP(candles, entry, direction, slDist, atr, targetRR = 3, regime = {}, config = {}) {
  const swingOpts = {
    windowSize: config.windowSize || 3,
    minMovePct: config.minMovePct || 0.15,
    maxSwings: config.maxSwings || 8,
    atr: atr
  };
  const swings = indicators.detectSwings(candles, swingOpts);

  // Base distances using targetRR
  const baseTP1Dist = slDist * Math.min(targetRR, 2);
  const baseTP2Dist = slDist * Math.min(targetRR * 1.5, 4);
  const baseTP3Dist = slDist * Math.min(targetRR * 2.5, 6);

  // Adjust based on regime volatility
  let volMultiplier = 1.0;
  if (regime.volatility === 'high') volMultiplier = 0.8; // tighter in high vol
  else if (regime.volatility === 'low') volMultiplier = 1.2; // wider in low vol

  // Find swing levels
  let tp1 = null, tp2 = null, tp3 = null;
  if (direction === 'buy') {
    // Find next swing high above entry
    let nextHigh = null;
    for (let i = 0; i < swings.highs.length; i++) {
      const s = swings.highs[i];
      if (s.price > entry) {
        if (!nextHigh || s.price < nextHigh.price) nextHigh = s;
      }
    }
    // If swing found, use it; else base distance
    tp1 = nextHigh ? nextHigh.price : entry + baseTP1Dist * volMultiplier;
    // Find next swing high above tp1
    let nextHigh2 = null;
    for (let i = 0; i < swings.highs.length; i++) {
      const s = swings.highs[i];
      if (s.price > tp1) {
        if (!nextHigh2 || s.price < nextHigh2.price) nextHigh2 = s;
      }
    }
    tp2 = nextHigh2 ? nextHigh2.price : entry + baseTP2Dist * volMultiplier;
    // Find next swing high above tp2 (or a resistance)
    let nextHigh3 = null;
    for (let i = 0; i < swings.highs.length; i++) {
      const s = swings.highs[i];
      if (s.price > tp2) {
        if (!nextHigh3 || s.price < nextHigh3.price) nextHigh3 = s;
      }
    }
    tp3 = nextHigh3 ? nextHigh3.price : entry + baseTP3Dist * volMultiplier;
  } else { // sell
    let nextLow = null;
    for (let i = 0; i < swings.lows.length; i++) {
      const s = swings.lows[i];
      if (s.price < entry) {
        if (!nextLow || s.price > nextLow.price) nextLow = s;
      }
    }
    tp1 = nextLow ? nextLow.price : entry - baseTP1Dist * volMultiplier;
    let nextLow2 = null;
    for (let i = 0; i < swings.lows.length; i++) {
      const s = swings.lows[i];
      if (s.price < tp1) {
        if (!nextLow2 || s.price > nextLow2.price) nextLow2 = s;
      }
    }
    tp2 = nextLow2 ? nextLow2.price : entry - baseTP2Dist * volMultiplier;
    let nextLow3 = null;
    for (let i = 0; i < swings.lows.length; i++) {
      const s = swings.lows[i];
      if (s.price < tp2) {
        if (!nextLow3 || s.price > nextLow3.price) nextLow3 = s;
      }
    }
    tp3 = nextLow3 ? nextLow3.price : entry - baseTP3Dist * volMultiplier;
  }

  // Ensure min gaps
  const minGap = atr * 0.3;
  if (Math.abs(tp2 - tp1) < minGap) {
    tp2 = direction === 'buy' ? tp1 + minGap : tp1 - minGap;
  }
  if (Math.abs(tp3 - tp2) < minGap) {
    tp3 = direction === 'buy' ? tp2 + minGap : tp2 - minGap;
  }

  // Round to 2 decimals
  const round = (v) => parseFloat(v.toFixed(2));
  return {
    tp1: round(tp1),
    tp2: round(tp2),
    tp3: round(tp3),
    levels: [round(tp1), round(tp2), round(tp3)]
  };
}

module.exports = { calculateAdaptiveTP };
