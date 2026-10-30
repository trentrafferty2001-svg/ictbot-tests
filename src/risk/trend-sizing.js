// src/risk/trend-sizing.js
const { computeTrendScore } = require('../analysis/trend-score');

// Simple MACD calculation (inlined to avoid external dependency)
function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
    if (!candles || candles.length < slow + signal) {
        return { macd: 0, signal: 0, histogram: 0, bullish: false, bearish: false };
    }
    const closes = candles.map(c => c.close);
    const ema = (arr, period) => {
        if (arr.length === 0) return 0;
        let k = 2 / (period + 1);
        let e = arr[0];
        for (let i = 1; i < arr.length; i++) {
            e = arr[i] * k + e * (1 - k);
        }
        return e;
    };
    // Build MACD series
    const macdValues = [];
    for (let i = slow; i <= closes.length; i++) {
        const slice = closes.slice(0, i);
        const fastEma = ema(slice, fast);
        const slowEma = ema(slice, slow);
        macdValues.push(fastEma - slowEma);
    }
    if (macdValues.length < signal) return { macd: 0, signal: 0, histogram: 0, bullish: false, bearish: false };
    const macdLine = macdValues[macdValues.length - 1];
    const signalLine = ema(macdValues, signal);
    const histogram = macdLine - signalLine;
    return { macd: macdLine, signal: signalLine, histogram, bullish: macdLine > signalLine, bearish: macdLine < signalLine };
}

function computeTrendQuality(analysis, candlesByTF) {
    let score = 0;
    // ADX
    if (analysis.adxData && analysis.adxData.adx) {
        if (analysis.adxData.adx > 40) score += 40;
        else if (analysis.adxData.adx > 25) score += 20;
    }
    // MTF trend
    const trend = computeTrendScore(candlesByTF);
    if (trend.direction === analysis.signal) {
        score += Math.min(30, Math.abs(trend.score) * 2);
    } else if (trend.direction !== 'neutral') {
        score -= 10;
    }
    // Slope strength from H4
    if (candlesByTF.h4 && candlesByTF.h4.length >= 20) {
        const { linearRegression } = require('../analysis/trend-score');
        const reg = linearRegression(candlesByTF.h4, 20);
        if (Math.abs(reg.slope) > 0.001) score += 15;
        if (reg.r2 > 0.4) score += 15;
    }
    // Volume confirmation
    if (analysis.volumeProfile && analysis.volumeProfile.buyVolumeRatio) {
        const ratio = analysis.volumeProfile.buyVolumeRatio;
        if ((analysis.signal === 'buy' && ratio > 0.55) || (analysis.signal === 'sell' && ratio < 0.45)) {
            score += 10;
        }
    }
    // MACD alignment
    const macd = calcMACD(candlesByTF.h1 || [], 12, 26, 9);
    if (analysis.signal === 'buy' && macd.bullish) score += 5;
    if (analysis.signal === 'sell' && macd.bearish) score += 5;
    return Math.min(100, Math.max(0, score));
}

module.exports = { computeTrendQuality };
