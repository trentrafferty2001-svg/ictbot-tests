// src/indicators/donchian.js
function donchian(candles, period) {
  if (candles.length < period) return { high: 0, low: 0, mid: 0, breakHigh: false, breakLow: false };
  const slice = candles.slice(-period);
  const high = Math.max(...slice.map(c => c.high));
  const low = Math.min(...slice.map(c => c.low));
  const mid = (high + low) / 2;
  const last = candles[candles.length - 1];
  return { high, low, mid, breakHigh: last.close > high, breakLow: last.close < low };
}

module.exports = { donchian };
