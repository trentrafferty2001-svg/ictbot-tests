// src/analysis/trend-score.js
function linearRegression(candles, lookback) {
  const closes = candles.slice(-lookback).map(c => c.close);
  const n = closes.length;
  if (n < 2) return { slope: 0, r2: 0, direction: 'neutral' };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = closes[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const predicted = closes.map((_, i) => slope * i + intercept);
  const ssTotal = closes.reduce((s, y) => s + (y - sumY/n) ** 2, 0);
  const ssRes = predicted.reduce((s, yhat, i) => s + (closes[i] - yhat) ** 2, 0);
  const r2 = ssTotal > 0 ? 1 - ssRes / ssTotal : 0;
  const direction = slope > 0.0001 ? 'bullish' : slope < -0.0001 ? 'bearish' : 'neutral';
  return { slope, r2, direction, intercept };
}

function computeTrendScore(candlesByTF) {
  const weights = { d1: 0.4, h4: 0.3, h1: 0.2, m30: 0.1 };
  let score = 0, totalWeight = 0;
  for (const [tf, candles] of Object.entries(candlesByTF)) {
    if (!candles || candles.length < 20) continue;
    const reg = linearRegression(candles, 20);
    const dir = reg.direction === 'bullish' ? 1 : reg.direction === 'bearish' ? -1 : 0;
    const strength = Math.min(1, Math.abs(reg.slope) / 0.001);
    const weight = weights[tf] || 0.1;
    totalWeight += weight;
    score += dir * (0.5 + 0.5 * reg.r2) * strength * weight;
  }
  if (totalWeight === 0) return { score: 0, direction: 'neutral' };
  score = score / totalWeight * 10;
  const direction = score > 1 ? 'bullish' : score < -1 ? 'bearish' : 'neutral';
  return { score, direction };
}

module.exports = { linearRegression, computeTrendScore };
