'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  EA engine — indicator maths (added 2026-10-30)
//
//  The same formulas as MetaTrader 5's built-in indicators, so a strategy
//  tested here and the .mq5 Expert Advisor exported from it (src/ea/mql5.js)
//  read the same numbers. Each function takes series in time order (oldest
//  first) and returns a Float64Array of the same length, NaN where the value
//  isn't defined yet. Source: the indicator code MetaQuotes ships with MT5
//  (MQL5/Indicators/Examples: Moving Averages, RSI, ATR, MACD, BB, Stochastic,
//  ADX, CCI, Momentum, StdDev).
//
//  Recursive averages (EMA, SMMA, RSI, ADX) start from the first bar, as in
//  MT5, so they need a run-in before they match MT5's values (which start
//  from the beginning of the chart): see warmupBars(). After 4× the period
//  for EMA-type and 8× for Wilder-type averages the start-up error is below
//  0.04% of the starting gap.
// ════════════════════════════════════════════════════════════════════════════

const nanArr = n => new Float64Array(n).fill(NaN);
const ok = x => x === x; // not NaN

// iMA MODE_SMA: plain average of the last n values.
function sma(src, n) {
    const out = nanArr(src.length);
    let sum = 0, run = 0;
    for (let i = 0; i < src.length; i++) {
        const v = src[i];
        if (!ok(v)) { sum = 0; run = 0; continue; }
        sum += v; run++;
        if (run > n) { sum -= src[i - n]; run = n; }
        if (run === n) out[i] = sum / n;
    }
    // re-sum every 1000 bars would avoid float drift on very long series;
    // with prices around 10^3 and n <= 10^3 the drift stays below 1e-9.
    return out;
}

// iMA MODE_EMA: MT5 starts the average at the first price and smooths with
// 2/(n+1). Values before n-1 bars are hidden (MT5's draw-begin).
function ema(src, n) {
    const out = nanArr(src.length), a = 2 / (n + 1);
    let prev = NaN, start = -1;
    for (let i = 0; i < src.length; i++) {
        const v = src[i];
        if (!ok(v)) { prev = NaN; start = -1; continue; }
        if (start < 0) { start = i; prev = v; } else prev = v * a + prev * (1 - a);
        if (i - start >= n - 1) out[i] = prev;
    }
    return out;
}

// iMA MODE_SMMA (Wilder's average): starts as the SMA of the first n values.
function smma(src, n) {
    const out = nanArr(src.length);
    let prev = NaN, sum = 0, run = 0;
    for (let i = 0; i < src.length; i++) {
        const v = src[i];
        if (!ok(v)) { prev = NaN; sum = 0; run = 0; continue; }
        if (ok(prev)) { prev = (prev * (n - 1) + v) / n; out[i] = prev; continue; }
        sum += v; run++;
        if (run === n) { prev = sum / n; out[i] = prev; }
    }
    return out;
}

// iMA MODE_LWMA: weights n, n-1, ..., 1 (newest heaviest).
function lwma(src, n) {
    const out = nanArr(src.length), wsum = n * (n + 1) / 2;
    for (let i = n - 1; i < src.length; i++) {
        let s = 0, bad = false;
        for (let j = 0; j < n; j++) { const v = src[i - j]; if (!ok(v)) { bad = true; break; } s += v * (n - j); }
        if (!bad) out[i] = s / wsum;
    }
    return out;
}

// iRSI: Wilder's RSI. First averages are the plain mean of the first n
// changes; 50 when there was no change at all, 100 when only gains.
function rsi(src, n) {
    const out = nanArr(src.length);
    if (src.length <= n) return out;
    let pos = 0, neg = 0;
    for (let i = 1; i <= n; i++) { const d = src[i] - src[i - 1]; if (d > 0) pos += d; else neg -= d; }
    pos /= n; neg /= n;
    const val = () => neg !== 0 ? 100 - 100 / (1 + pos / neg) : (pos !== 0 ? 100 : 50);
    out[n] = val();
    for (let i = n + 1; i < src.length; i++) {
        const d = src[i] - src[i - 1];
        pos = (pos * (n - 1) + (d > 0 ? d : 0)) / n;
        neg = (neg * (n - 1) + (d < 0 ? -d : 0)) / n;
        out[i] = val();
    }
    return out;
}

// True range: high/low widened to the previous close (the first bar: high-low).
function trueRange(high, low, close) {
    const out = new Float64Array(high.length);
    for (let i = 0; i < high.length; i++) {
        if (i === 0) { out[i] = high[i] - low[i]; continue; }
        const pc = close[i - 1];
        out[i] = Math.max(high[i], pc) - Math.min(low[i], pc);
    }
    return out;
}

// iATR: MT5's ATR is the PLAIN average of the last n true ranges (not
// Wilder's), defined from bar n (the first true range, bar 0's, is skipped).
function atr(high, low, close, n) {
    const tr = trueRange(high, low, close), out = nanArr(high.length);
    let sum = 0;
    for (let i = 1; i < high.length; i++) {
        sum += tr[i];
        if (i > n) sum -= tr[i - n];
        if (i >= n) out[i] = sum / n;
    }
    return out;
}

// iMACD: EMA(fast) − EMA(slow); the signal line is a PLAIN average of it
// (MT5's built-in MACD uses an SMA for the signal, unlike most charting sites).
function macd(src, fast, slow, signal) {
    const f = ema(src, fast), s = ema(src, slow), main = nanArr(src.length);
    for (let i = 0; i < src.length; i++) if (ok(f[i]) && ok(s[i])) main[i] = f[i] - s[i];
    return { main, signal: sma(main, signal) };
}

// Population standard deviation of the last n values around their SMA (iStdDev, iBands).
function stddev(src, n, mid) {
    const m = mid || sma(src, n), out = nanArr(src.length);
    for (let i = n - 1; i < src.length; i++) {
        if (!ok(m[i])) continue;
        let s = 0;
        for (let j = 0; j < n; j++) { const d = src[i - j] - m[i]; s += d * d; }
        out[i] = Math.sqrt(s / n);
    }
    return out;
}

// iBands: SMA ± k standard deviations.
function bands(src, n, k) {
    const mid = sma(src, n), sd = stddev(src, n, mid), upper = nanArr(src.length), lower = nanArr(src.length);
    for (let i = 0; i < src.length; i++) if (ok(mid[i]) && ok(sd[i])) { upper[i] = mid[i] + k * sd[i]; lower[i] = mid[i] - k * sd[i]; }
    return { mid, upper, lower };
}

// iStochastic (STO_LOWHIGH, MODE_SMA): %K = 100 × Σ(close − lowest) /
// Σ(highest − lowest) over `slowing` bars (100 when the range is zero);
// %D = SMA(%K, d).
function stochastic(high, low, close, kp, dp, slowing) {
    const n = high.length, hh = nanArr(n), ll = nanArr(n), main = nanArr(n);
    for (let i = kp - 1; i < n; i++) {
        let mx = -Infinity, mn = Infinity;
        for (let j = i - kp + 1; j <= i; j++) { if (high[j] > mx) mx = high[j]; if (low[j] < mn) mn = low[j]; }
        hh[i] = mx; ll[i] = mn;
    }
    for (let i = kp - 1 + slowing - 1; i < n; i++) {
        let sl = 0, sh = 0;
        for (let j = i - slowing + 1; j <= i; j++) { sl += close[j] - ll[j]; sh += hh[j] - ll[j]; }
        main[i] = sh === 0 ? 100 : sl / sh * 100;
    }
    return { main, signal: sma(main, dp) };
}

// iADX (MetaQuotes' version, not iADXWilder): directional movement as a % of
// the true range, smoothed with an EMA of 2/(n+1); ADX is the same EMA of
// 100×|+DI − −DI| / (+DI + −DI). +DI/−DI shown from bar n, ADX from bar 2n.
function adx(high, low, close, n) {
    const len = high.length, a = 2 / (n + 1);
    const pdi = nanArr(len), ndi = nanArr(len), adxOut = nanArr(len);
    let sp = 0, sn = 0, sa = 0;
    for (let i = 1; i < len; i++) {
        let up = high[i] - high[i - 1], dn = low[i - 1] - low[i];
        if (up < 0) up = 0;
        if (dn < 0) dn = 0;
        if (up > dn) dn = 0; else if (up < dn) up = 0; else { up = 0; dn = 0; }
        const pc = close[i - 1], tr = Math.max(Math.max(Math.abs(high[i] - low[i]), Math.abs(high[i] - pc)), Math.abs(low[i] - pc));
        const pd = tr !== 0 ? 100 * up / tr : 0, nd = tr !== 0 ? 100 * dn / tr : 0;
        sp = pd * a + sp * (1 - a);
        sn = nd * a + sn * (1 - a);
        const s = sp + sn, dx = s !== 0 ? 100 * Math.abs((sp - sn) / s) : 0;
        sa = dx * a + sa * (1 - a);
        if (i >= n) { pdi[i] = sp; ndi[i] = sn; }
        if (i >= 2 * n) adxOut[i] = sa;
    }
    return { adx: adxOut, plusDi: pdi, minusDi: ndi };
}

// iCCI: (price − SMA) / (0.015 × mean absolute deviation from that SMA); 0
// when the deviation is zero. Usually on the typical price (H+L+C)/3.
function cci(src, n) {
    const m = sma(src, n), out = nanArr(src.length);
    for (let i = n - 1; i < src.length; i++) {
        if (!ok(m[i])) continue;
        let d = 0;
        for (let j = 0; j < n; j++) d += Math.abs(src[i - j] - m[i]);
        d *= 0.015 / n;
        out[i] = d !== 0 ? (src[i] - m[i]) / d : 0;
    }
    return out;
}

// iMomentum: price as a % of the price n bars earlier (100 = unchanged).
function momentum(src, n) {
    const out = nanArr(src.length);
    for (let i = n; i < src.length; i++) if (src[i - n] !== 0 && ok(src[i]) && ok(src[i - n])) out[i] = src[i] * 100 / src[i - n];
    return out;
}

// Highest / lowest value of the last n bars, this bar included (iHighest / iLowest).
function highest(src, n) {
    const out = nanArr(src.length);
    for (let i = n - 1; i < src.length; i++) { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) { if (!ok(src[j])) { m = NaN; break; } if (src[j] > m) m = src[j]; } out[i] = m; }
    return out;
}
function lowest(src, n) {
    const out = nanArr(src.length);
    for (let i = n - 1; i < src.length; i++) { let m = Infinity; for (let j = i - n + 1; j <= i; j++) { if (!ok(src[j])) { m = NaN; break; } if (src[j] < m) m = src[j]; } out[i] = m; }
    return out;
}

// MT5's applied prices.
function price(bars, field) {
    const n = bars.high.length, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const h = bars.high[i], l = bars.low[i], c = bars.close[i];
        out[i] = field === 'median' ? (h + l) / 2 : field === 'typical' ? (h + l + c) / 3 : field === 'weighted' ? (h + l + 2 * c) / 4 : bars[field][i];
    }
    return out;
}

module.exports = { sma, ema, smma, lwma, rsi, trueRange, atr, macd, stddev, bands, stochastic, adx, cci, momentum, highest, lowest, price };
