// src/filters/exhaustion.js
function calcRSI(candles, period=14) {
  if (candles.length < period+1) return 50;
  const closes = candles.map(c => c.close);
  let gains = 0, losses = 0;
  for (let i = 1; i < period+1; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period+1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff >= 0) avgGain = (avgGain * (period-1) + diff) / period;
    else avgLoss = (avgLoss * (period-1) - diff) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function exhaustionFilter(candles, signal) {
  const rsi = calcRSI(candles, 14);
  if (signal === 'buy' && rsi > 70) return { pass: false, reason: 'RSI overbought (>70)' };
  if (signal === 'sell' && rsi < 30) return { pass: false, reason: 'RSI oversold (<30)' };
  // Momentum slowing
  const mom = (c) => {
    if (c.length < 10) return 0;
    return (c[c.length-1].close - c[c.length-6].close) / c[c.length-6].close * 100;
  };
  const mom5 = mom(candles);
  const momPrev = (candles.length > 10) ? (candles[candles.length-6].close - candles[candles.length-11].close) / candles[candles.length-11].close * 100 : 0;
  if (Math.abs(mom5) < Math.abs(momPrev) * 0.5 && Math.abs(mom5) > 0.1) {
    return { pass: true, sizeMultiplier: 0.7, reason: 'Momentum slowing – size reduced' };
  }
  return { pass: true, sizeMultiplier: 1, reason: 'OK' };
}

module.exports = { calcRSI, exhaustionFilter };
