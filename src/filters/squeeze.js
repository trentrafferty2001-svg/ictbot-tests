'use strict';

const indicators = require('../indicators');

/**
 * Check if market is in a squeeze (low volatility).
 * @param {Array} candles - OHLCV array.
 * @param {number} period - period for BB and KC.
 * @param {number} bbMultiplier - standard deviation multiplier.
 * @param {number} kcMultiplier - ATR multiplier.
 * @returns {Object} { squeeze: boolean, width: number, direction: string }
 */
function detectSqueeze(candles, period = 20, bbMultiplier = 2, kcMultiplier = 1.5) {
  if (!candles || candles.length < period) {
    return { squeeze: false, width: 0, direction: 'neutral' };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // Bollinger Bands
  const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((s, v) => s + Math.pow(v - sma, 2), 0) / closes.length;
  const std = Math.sqrt(variance);
  const upperBB = sma + bbMultiplier * std;
  const lowerBB = sma - bbMultiplier * std;
  const bbWidth = upperBB - lowerBB;

  // Keltner Channel (using ATR)
  const atr = indicators.calcATR14(candles);
  const typicalPrice = (highs[highs.length-1] + lows[lows.length-1] + closes[closes.length-1]) / 3;
  const upperKC = typicalPrice + kcMultiplier * atr;
  const lowerKC = typicalPrice - kcMultiplier * atr;
  const kcWidth = upperKC - lowerKC;

  // Squeeze: BB width < KC width
  const squeeze = bbWidth < kcWidth * 0.9;

  // Direction: if price above upper KC, bullish; below lower KC, bearish
  let direction = 'neutral';
  const lastClose = closes[closes.length-1];
  if (lastClose > upperKC) direction = 'bullish';
  else if (lastClose < lowerKC) direction = 'bearish';

  return { squeeze, width: bbWidth, direction };
}

module.exports = { detectSqueeze };
