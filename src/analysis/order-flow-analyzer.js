// ════════════════════════════════════════════════════════════════════════════
//  Order Flow Analyzer (candle-based proxy)
//
//  This bot has no tick-level bid/ask feed, so "order flow" here means a
//  proxy derived from OHLCV candles rather than true tape reading:
//
//  - buyRatio/sellRatio: volume-weighted Close Location Value (CLV) across
//    the recent window. CLV = (close - low) / (high - low) — a close near
//    the bar's high suggests buyers were in control by close; near the low,
//    sellers were. Weighting by volume follows the same logic as Chaikin
//    Money Flow / the Accumulation-Distribution line.
//  - absorption: the most recent bar has an unusually wide range relative
//    to ATR, but a small body relative to that range — price attempted to
//    move but was absorbed rather than following through.
//  - exhaustion: a consistent directional run over the prior bars, followed
//    by the most recent bar's range contracting well below the recent
//    average — momentum fading after a strong push.
// ════════════════════════════════════════════════════════════════════════════

class OrderFlowAnalyzer {
    analyze(candles, atr14) {
        const result = { absorption: false, exhaustion: false, buyRatio: 0.5, sellRatio: 0.5 };
        if (!Array.isArray(candles) || candles.length < 10 || !atr14 || atr14 <= 0) return result;

        const recent = candles.slice(-10);

        let buyPressure = 0, sellPressure = 0;
        for (const c of recent) {
            const range = c.high - c.low;
            const vol = c.volume || 0;
            if (range <= 0 || vol <= 0) continue;
            const clv = (c.close - c.low) / range;
            buyPressure += clv * vol;
            sellPressure += (1 - clv) * vol;
        }
        const totalPressure = buyPressure + sellPressure;
        if (totalPressure > 0) {
            result.buyRatio = buyPressure / totalPressure;
            result.sellRatio = sellPressure / totalPressure;
        }

        const last = recent[recent.length - 1];
        const lastRange = last.high - last.low;
        const lastBody = Math.abs(last.close - last.open);
        if (lastRange > atr14 * 1.5 && (lastBody / lastRange) < 0.3) {
            result.absorption = true;
        }

        const prior = recent.slice(0, -1);
        const closes = prior.map(c => c.close);
        const netMove = closes.length > 1 ? closes[closes.length - 1] - closes[0] : 0;
        let sameDirCount = 0;
        for (let i = 1; i < closes.length; i++) {
            const step = closes[i] - closes[i - 1];
            if ((step > 0 && netMove > 0) || (step < 0 && netMove < 0)) sameDirCount++;
        }
        const avgPriorRange = prior.reduce((s, c) => s + (c.high - c.low), 0) / (prior.length || 1);
        const strongRun = closes.length > 2 && sameDirCount >= Math.ceil((closes.length - 1) * 0.6);
        if (strongRun && avgPriorRange > 0 && lastRange < avgPriorRange * 0.5) {
            result.exhaustion = true;
        }

        return result;
    }
}

module.exports = { OrderFlowAnalyzer };

