// ════════════════════════════════════════════════════════════════════════════
//  Top-Down Alignment
//
//  Classic multi-timeframe confluence: how many of the 4h/1h/30m/15m biases
//  agree, weighted toward the higher timeframes. Weights mirror the same
//  0.4/0.3/0.2/0.1 pattern already used by computeTrendScore's fallback
//  elsewhere in this file, applied to the timeframes this function actually
//  receives (h4 down to m15 rather than d1 down to m30).
//
//  Each bias is expected to be 'bullish' | 'bearish' | 'neutral' (the exact
//  return shape of indicators.calcHTFBias).
// ════════════════════════════════════════════════════════════════════════════

const WEIGHTS = { h4: 0.4, h1: 0.3, m30: 0.2, m15: 0.1 };
const BIAS_THRESHOLD = 0.3;

function biasToSign(bias) {
    if (bias === 'bullish') return 1;
    if (bias === 'bearish') return -1;
    return 0;
}

function getTopDownAlignment(bias4h, bias1h, bias30m, bias15m) {
    const netScore =
        biasToSign(bias4h) * WEIGHTS.h4 +
        biasToSign(bias1h) * WEIGHTS.h1 +
        biasToSign(bias30m) * WEIGHTS.m30 +
        biasToSign(bias15m) * WEIGHTS.m15;

    let bias = 'neutral';
    if (netScore >= BIAS_THRESHOLD) bias = 'bullish';
    else if (netScore <= -BIAS_THRESHOLD) bias = 'bearish';

    const score = Math.abs(netScore); // 0 (mixed) .. ~1.0 (full 4-way agreement)

    return { bias, score };
}

module.exports = { getTopDownAlignment };
