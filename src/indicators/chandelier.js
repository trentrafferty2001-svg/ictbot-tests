// src/indicators/chandelier.js
function chandelierExit(candles, atr, period=22, multiplier=3) {
  if (candles.length < period) return { longStop: 0, shortStop: 0 };
  const highs = candles.slice(-period).map(c => c.high);
  const lows = candles.slice(-period).map(c => c.low);
  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  const longStop = highestHigh - atr * multiplier;
  const shortStop = lowestLow + atr * multiplier;
  return { longStop, shortStop };
}

module.exports = { chandelierExit };
